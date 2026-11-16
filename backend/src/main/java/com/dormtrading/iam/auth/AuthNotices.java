package com.dormtrading.iam.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class AuthNotices {
    private final JdbcTemplate db;
    private final JavaMailSender mail;
    private final String from;
    public AuthNotices(JdbcTemplate db,JavaMailSender mail,@Value("${app.auth.mail-from:no-reply@dorm.local}") String from) {
        this.db=db; this.mail=mail; this.from=from;
    }
    @Scheduled(fixedDelayString="${app.auth.notice-delay-ms:30000}")
    @Transactional
    public void deliver() {
        for (var row:db.queryForList("select * from auth_notice where not sent order by id limit 20 for update skip locked")) {
            var message=new SimpleMailMessage(); message.setFrom(from); message.setTo(row.get("email").toString());
            message.setSubject("Mật khẩu Dorm Trading đã thay đổi");
            message.setText("Mật khẩu của bạn vừa được thay đổi. Nếu không phải bạn, hãy đặt lại mật khẩu và liên hệ hỗ trợ.");
            try { mail.send(message); db.update("update auth_notice set sent=true where id=?",row.get("id")); }
            catch (org.springframework.mail.MailException e) { break; } // Durable retry; never roll back the password change.
        }
    }
    @Scheduled(fixedDelay=3600000)
    @Transactional
    public void cleanup() {
        db.update("delete from auth_event where happened_at < current_timestamp - interval '2 days'");
        db.update("delete from auth_challenge where expires_at < current_timestamp - interval '2 days'");
        db.update("delete from auth_reset_grant where expires_at < current_timestamp - interval '2 days'");
        db.update("delete from auth_refresh where session_id in (select id from auth_session where expires_at < current_timestamp)");
        db.update("delete from auth_session where expires_at < current_timestamp");
        db.update("delete from auth_notice where sent and created_at < current_timestamp - interval '30 days'");
    }
}
