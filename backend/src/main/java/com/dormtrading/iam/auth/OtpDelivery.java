package com.dormtrading.iam.auth;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class OtpDelivery {
    private final JdbcTemplate db;
    private final JavaMailSender mail;
    private final SecureRandom random;
    private final byte[] key;
    private final String from;
    public OtpDelivery(JdbcTemplate db,JavaMailSender mail,SecureRandom random,
                       @Value("${app.jwt.secret}") String secret,@Value("${app.auth.mail-from:no-reply@dorm.local}") String from) {
        this.db=db; this.mail=mail; this.random=random; this.from=from;
        try {
            var mac=Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(Base64.getDecoder().decode(secret),"HmacSHA256"));
            this.key=mac.doFinal("dorm-otp-outbox-v1".getBytes(StandardCharsets.US_ASCII));
        } catch(GeneralSecurityException e) { throw new IllegalStateException(e); }
    }
    public void enqueue(UUID challenge,String body) {
        byte[] nonce=new byte[12]; random.nextBytes(nonce);
        try {
            var cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,nonce));
            cipher.updateAAD(challenge.toString().getBytes(StandardCharsets.US_ASCII));
            String payload=Base64.getEncoder().encodeToString(nonce)+":"+Base64.getEncoder().encodeToString(cipher.doFinal(body.getBytes(StandardCharsets.UTF_8)));
            db.update("insert into auth_otp_delivery(challenge_id,payload) values (?,?)",challenge,payload);
        } catch(GeneralSecurityException e) { throw new IllegalStateException(e); }
    }
    @Scheduled(fixedDelayString="${app.auth.otp-delivery-delay-ms:3000}")
    @Transactional
    public void deliver() {
        for(var row:db.queryForList("""
                select d.challenge_id,d.payload,c.email,c.purpose from auth_otp_delivery d
                join auth_challenge c on c.id=d.challenge_id
                where not d.sent and not c.used and c.expires_at>current_timestamp
                order by c.created_at limit 20 for update of d skip locked
                """)) {
            try {
                String[] parts=row.get("payload").toString().split(":");
                var cipher=Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,Base64.getDecoder().decode(parts[0])));
                cipher.updateAAD(row.get("challenge_id").toString().getBytes(StandardCharsets.US_ASCII));
                String body=new String(cipher.doFinal(Base64.getDecoder().decode(parts[1])),StandardCharsets.UTF_8);
                var message=new SimpleMailMessage(); message.setFrom(from); message.setTo(row.get("email").toString());
                message.setSubject("REGISTER".equals(row.get("purpose")) ? "Xác minh đăng ký Dorm Trading" : "Đặt lại mật khẩu Dorm Trading");
                message.setText(body); mail.send(message);
                db.update("update auth_otp_delivery set sent=true,payload='' where challenge_id=?",row.get("challenge_id"));
            } catch(GeneralSecurityException | org.springframework.mail.MailException e) {
                db.update("update auth_otp_delivery set failures=failures+1 where challenge_id=?",row.get("challenge_id"));
                // Retry within code lifetime. Never log the encrypted/decrypted payload or SMTP body.
            }
        }
    }
}
