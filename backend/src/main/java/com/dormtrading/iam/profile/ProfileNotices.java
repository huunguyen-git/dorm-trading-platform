package com.dormtrading.iam.profile;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class ProfileNotices {
    private final JdbcTemplate db;
    private final JavaMailSender mail;
    private final String from;
    public ProfileNotices(JdbcTemplate db, JavaMailSender mail,
                          @Value("${app.auth.mail-from:no-reply@dorm.local}") String from) {
        this.db = db; this.mail = mail; this.from = from;
    }
    @Scheduled(fixedDelayString = "${app.auth.notice-delay-ms:30000}")
    @Transactional
    public void deliver() {
        for (var row : db.queryForList("select * from ho_so_thong_bao where not sent order by id limit 20 for update skip locked")) {
            var message = new SimpleMailMessage();
            message.setFrom(from); message.setTo(row.get("email").toString());
            message.setSubject("Hồ sơ Dorm Trading chưa được duyệt");
            message.setText("Hồ sơ của bạn chưa được duyệt. Lý do: " + row.get("ly_do")
                    + "\nBạn có thể cập nhật hồ sơ và gửi duyệt lại.");
            try {
                mail.send(message);
                db.update("update ho_so_thong_bao set sent=true where id=?", row.get("id"));
            } catch (org.springframework.mail.MailException e) {
                db.update("update ho_so_thong_bao set failures=failures+1 where id=?", row.get("id"));
                break;
            }
        }
    }
}
