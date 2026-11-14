package com.dormtrading.catalog;

import java.util.List;
import java.util.UUID;
import com.dormtrading.iam.auth.AuthFailure;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

/** Minimal public read contract for pending accounts; publishing/search remain Phase 2. */
@RestController
@RequestMapping("/api/v1/listings")
public class PublicListingsController {
    private final JdbcTemplate db;
    public PublicListingsController(JdbcTemplate db) { this.db=db; }
    public record Listing(UUID id,String title,String description,int price,String seller) {}
    @GetMapping
    public List<Listing> list(@RequestParam(defaultValue="0") int offset) {
        if (offset < 0 || offset > 10000) throw new AuthFailure(400,"INVALID_OFFSET","Vị trí trang không hợp lệ.");
        return db.query("""
                select t.ma_tin,t.tieu_de,t.mo_ta,t.gia_vnd,u.ho_ten from tin_dangs t
                join thanh_viens u on u.user_id=t.nguoi_dang_id
                where t.trang_thai='CONG_KHAI' order by t.created_at desc,t.ma_tin limit 100 offset ?
                """,(rs,i) -> new Listing(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getInt(4),rs.getString(5)),offset);
    }
}
