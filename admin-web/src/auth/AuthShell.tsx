import type { ReactNode } from 'react';
export default function AuthShell({ children }: { children: ReactNode }) {
  return <main className="auth-page"><div className="auth-layout">
    <section className="auth-intro" aria-label="Dorm Trading">
      <a className="auth-brand" href="/">DORM TRADING<span>CỘNG ĐỒNG SINH VIÊN</span></a>
      <div><p className="eyebrow">KHÔNG GIAN QUẢN TRỊ</p><h1>Kết nối cộng đồng.<br />Giữ niềm tin.</h1>
        <p>Quản lý tài khoản và đồng hành cùng những giao dịch an toàn trong cộng đồng sinh viên.</p></div>
      <div className="intro-note"><span className="intro-mark" aria-hidden="true">D</span><p>Mỗi món đồ, một hành trình mới.<br />Mỗi tài khoản, một kết nối tin cậy.</p></div>
    </section>
    <section className="auth-stage">{children}<p className="auth-footer">Dorm Trading · Dành cho kiểm duyệt viên và quản trị viên</p></section>
  </div></main>;
}
