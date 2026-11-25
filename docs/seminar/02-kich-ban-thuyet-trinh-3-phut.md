# Kịch bản Thuyết trình Seminar: Phần 4 – Lựa chọn Công nghệ & Thiết kế CI/CD Pipeline
## Diễn giả: Lê Vũ Hoàng Nguyên | Thời lượng: 3 Phút 30 Giây – 4 Phút (Chuẩn Seminar Đẳng cấp)

> **Vị trí trong Seminar:** Phần 4 trên tổng số 5 phần của Nhóm 14  
> **Người nói trước (Phần 3):** Nguyễn Quốc Nguyên (Kiến trúc Đa Container với Docker Compose)  
> **Người nói sau (Phần 5):** Tô Thành Nguyên (Cấu hình Workflow YAML, Quản trị Secrets & Live Demo)  
>
> **Nhiệm vụ trọng tâm của Phần 4:**
> 1. So sánh Jenkins vs. GitHub Actions (Hạ tầng, Tích hợp repo, Cấu hình).
> 2. Lý giải lựa chọn GitHub Actions cho nhóm đồ án.
> 3. Thiết kế CI build/test backend, web quản trị, mobile & CD triển khai API/web, tạo bản cài mobile.
> 4. Tích hợp unit test nghiệp vụ, E2E mobile và web trước khi phát hành.
>
> **Định lượng:** ~530 từ thoại tiếng Việt, tốc độ nói thuyết trình 135 – 140 từ/phút (đĩnh đạc, dứt khoát, tự tin).

---

## Phân bổ Thời gian & Cấu trúc 4 Slide Trọng tâm

```
[0:00 - 0:20]  Cầu nối chuyển tiếp từ Phần 3 (Docker Compose -> Tự động hóa CI/CD)
[0:20 - 1:05]  Slide 1: So sánh Nền tảng: Jenkins vs. GitHub Actions
[1:05 - 1:45]  Slide 2: Lý giải Quyết định: Tại sao GitHub Actions tối ưu cho Đồ án?
[1:45 - 2:50]  Slide 3: Thiết kế Pipeline CI/CD Đa nền tảng (Backend, Web, Mobile)
[2:50 - 3:40]  Slide 4: Chiến lược Kiểm thử Tự động: Từ Unit Test Nghiệp vụ đến E2E
[3:40 - 3:55]  Tổng kết & Chuyển giao mượt mà sang Phần 5 (Tô Thành Nguyên)
```

---

## Kịch bản Chi tiết: Trực quan Slide & Lời thoại Từng Giây

### 🎙️ LỜI MỞ ĐẦU & CẦU NỐI CHUYỂN TIẾP (0:00 – 0:20 | 20 giây)

> *(Cười nhẹ, hướng tay về bạn Quốc Nguyên vừa kết thúc Phần 3, sau đó hướng mắt về hội đồng)*  
>
> *"Xin cảm ơn phần trình bày rất trực quan của bạn Quốc Nguyên về Docker Compose.*  
> *Như vậy, ở ba phần trước, nhóm chúng em đã chuẩn hóa xong mô hình đóng gói container trên máy phát triển cục bộ. Nhưng câu hỏi hóc búa đặt ra lúc này là: **Làm thế nào để mọi commit của 5 thành viên đều được tự động biên dịch, chạy hàng trăm ca kiểm thử và đóng gói bản phát hành ngay lập tức mà không cần bất kỳ thao tác thủ công nào?***  
> *Sau đây, em xin đại diện nhóm trình bày **Phần 4: Lựa chọn công nghệ và Thiết kế kiến trúc CI/CD Pipeline cho toàn bộ hệ thống.**"*

---

### SLIDE 1: SO SÁNH NỀN TẢNG: JENKINS VS. GITHUB ACTIONS (0:20 – 1:05 | 45 giây)

* **Tiêu đề Slide:** So sánh Nền tảng: Jenkins vs. GitHub Actions
* **Hiển thị trên Slide (Trực quan hóa dạng bảng đối đầu 3 trục):**
  * **1. Hạ tầng (Infrastructure):**
    * *Jenkins:* Stateful Controller-Agent, tự bảo trì máy chủ (Self-hosted), rủi ro xung đột plugin.
    * *GitHub Actions:* Cloud-managed Serverless, cấp phát máy ảo tạm thời (**Ephemeral VM**) sạch 100%, tự hủy sau mỗi lần chạy.
  * **2. Tích hợp Repo (Repo Integration):**
    * *Jenkins:* Phải cấu hình Webhook ngoài, mở port mạng, dùng token trung gian.
    * *GitHub Actions:* **Native cấp hệ thống**, tích hợp trực tiếp vào giao diện Pull Request và Branch Protection Rules.
  * **3. Cấu hình (Configuration):**
    * *Jenkins:* Groovy DSL (đường cong học tập dốc, khó debug sandbox).
    * *GitHub Actions:* Declarative YAML chuẩn hóa, tái sử dụng hàng nghìn action trên Marketplace.

#### 🎙️ Lời thoại trình bày:
> *"Khi đặt bài toán lựa chọn công cụ tự động hóa, nhóm đã đặt lên bàn cân hai giải pháp hàng đầu hiện nay: **Jenkins** và **GitHub Actions** trên 3 khía cạnh cốt lõi:*
>
> *Thứ nhất về **hạ tầng**: Jenkins vận hành theo mô hình Master-Agent truyền thống, đòi hỏi chúng ta phải tự dựng máy chủ, tự vá lỗi hệ điều hành và đau đầu xử lý xung đột plugin. Trong khi đó, GitHub Actions là nền tảng Cloud-native hoàn toàn: mỗi lần chạy, GitHub sẽ cấp phát một máy ảo Ubuntu siêu sạch, chạy xong tự hủy bỏ, triệt tiêu hoàn toàn nguy cơ ô nhiễm môi trường chạy.*
>
> *Thứ hai về **tích hợp kho mã**: Nếu Jenkins phải mở port, cấu hình Webhook và token phức tạp, thì GitHub Actions là công cụ 'gốc' nằm ngay trong GitHub, phản hồi tức thì với từng sự kiện Pull Request.*
>
> *Và thứ ba về **cấu hình**: Thay vì phải viết mã Groovy phức tạp của Jenkinsfile, GitHub Actions sử dụng cú pháp YAML khai báo tường minh, dễ đọc và tận dụng được cả một kho tàng hàng chục nghìn Action chuẩn hóa trên GitHub Marketplace."*

---

### SLIDE 2: LÝ GIẢI LỰA CHỌN: TẠI SAO LÀ GITHUB ACTIONS? (1:05 – 1:45 | 40 giây)

* **Tiêu đề Slide:** Quyết định Kiến trúc: Tối ưu cho Nhóm Đồ án
* **Hiển thị trên Slide:**
  * 3 Luận điểm đanh thép:
    * 🎯 **Zero-Ops & Chi phí 0 VNĐ:** Không tốn tiền thuê VPS, miễn phí 2.000 phút/tháng, không tốn nhân lực bảo trì máy chủ.
    * 🛡️ **Branch Protection & Status Gate:** Chặn đứng mã lỗi trước khi vào nhánh `main`, bắt buộc vượt qua cổng kiểm duyệt `required`.
    * ⚡ **Monorepo & Concurrency:** Cơ chế hủy build cũ khi có commit mới (`cancel-in-progress`), bộ đệm Cache phản hồi cực nhanh (<15s).

#### 🎙️ Lời thoại trình bày:
> *"Từ những phân tích trên, nhóm 14 khẳng định **GitHub Actions là sự lựa chọn tối ưu tuyệt đối cho dự án đồ án** vì 3 lý do chiến lược:*
>
> *Một là, **Zero-Ops và tiết kiệm chi phí**. Nhóm không phải bỏ tiền túi thuê VPS để duy trì máy chủ Jenkins 24/7. Hạn mức 2.000 phút miễn phí mỗi tháng của GitHub là quá đủ cho toàn bộ chu kỳ phát triển.*
>
> *Hai là, **khóa chặt kỷ luật chất lượng**. GitHub Actions kết nối trực tiếp với Branch Protection Rule của GitHub. Nhóm thiết lập cổng kiểm duyệt bắt buộc mang tên **`required`**: Không một ai – kể cả nhóm trưởng – có thể merge mã nguồn nếu pipeline chưa báo xanh.*
>
> *Và ba là, **tối ưu cho mô hình Monorepo**. Với cơ chế Concurrency thông minh, khi một bạn đẩy commit mới để sửa lỗi, hệ thống sẽ tự động hủy các lượt chạy dở dang của commit cũ, vừa tiết kiệm tài nguyên, vừa trả về phản hồi thần tốc chỉ trong vòng 10 đến 15 giây nhờ cơ chế cache phân tán."*

---

### SLIDE 3: THIẾT KẾ CI/CD PIPELINE ĐA NỀN TẢNG (1:45 – 2:50 | 65 giây)

* **Tiêu đề Slide:** Kiến trúc CI/CD Pipeline: Backend, Web Quản trị & Mobile
* **Hiển thị trên Slide (Sơ đồ luồng 2 pha trực quan):**
  * **Pha CI (Chạy song song 3 nhánh trên PR):**
    * *Backend:* Temurin JDK 21 + Cache Maven -> `clean verify` -> Xuất báo cáo Surefire.
    * *Admin Web:* Node 24 + npm cache -> TypeScript lint (`tsc --noEmit`) -> Vitest -> Vite build.
    * *Mobile:* Node 24 + Expo SDK 53 -> TypeScript lint -> Jest -> Export bundle.
    * *Status Gate:* Gom toàn bộ trạng thái vào job `required` -> Xuất Step Summary.
  * **Pha CD (Kích hoạt khi merge `main` hoặc tạo Tag Release):**
    * *API & Web:* Build **Docker Multi-stage** siêu nhẹ (<150MB), non-root an toàn -> Đẩy lên GHCR -> Triển khai dịch vụ.
    * *Mobile:* Tự động biên dịch native **Standalone Android APK** -> Tải trực tiếp lên GitHub Releases.

#### 🎙️ Lời thoại trình bày:
> *(Dùng tay hướng về sơ đồ luồng trên màn hình)*  
> *"Dự án của chúng em là một hệ sinh thái đa nền tảng gồm Backend Spring Boot Java 21, Web quản trị React Vite và App di động React Native Expo. Chúng em thiết kế quy trình gồm hai pha độc lập:*
>
> *Đầu tiên là **Pha CI**, kích hoạt ngay khi mở Pull Request. Để tối ưu thời gian, pipeline chia làm **3 luồng chạy song song** trên các máy ảo riêng biệt:*
> - *Nhánh Backend nạp JDK 21, kích hoạt Maven cache, chạy toàn bộ bộ test và lưu trữ báo cáo kiểm thử Surefire.*
> - *Nhánh Web và Mobile trên nền Node 24 kiểm tra chặt chẽ lỗi kiểu dữ liệu TypeScript, chạy Unit Test và kiểm tra khả năng đóng gói bundle.*
> - *Cuối cùng, một job trọng tài mang tên **`required`** sẽ tổng hợp kết quả của cả 3 nhánh thành một bảng Step Summary trực quan và ra quyết định cho phép merge hay không.*
>
> *Tiếp theo là **Pha CD**, tự động kích hoạt khi mã nguồn được merge vào `main` hoặc gắn tag phát hành:*
> - *Với Backend và Web, pipeline thực hiện đóng gói **Docker Multi-stage**: tách riêng môi trường build khỏi môi trường chạy. Bản phân phối cuối cùng chỉ chứa JRE rút gọn, chạy với user non-root bảo mật và giảm kích thước ảnh từ gần 1GB xuống dưới 150MB trước khi đẩy lên registry.*
> - *Với Mobile, thay vì bắt người dùng tự clone code về build máy, CD sẽ tự động biên dịch native để **xuất xưởng trực tiếp file cài đặt Android APK**, đính kèm ngay vào GitHub Release để thầy cô và người dùng có thể tải về cài đặt lên điện thoại ngay lập tức."*

---

### SLIDE 4: CHIẾN LƯỢC KIỂM THỬ TỪ THIẾT KẾ OOAD (2:50 – 3:40 | 50 giây)

* **Tiêu đề Slide:** Đưa OOAD vào Kiểm thử Tự động: Từ Unit Test Nghiệp vụ đến E2E
* **Hiển thị trên Slide (Mô hình Tháp kiểm thử 3 tầng):**
  * 🔺 **Tầng 1 (Đáy - 70%): Unit Test Nghiệp vụ (Domain Invariants)**
    * Thuần POJO, JUnit 5/Vitest. Kiểm thử quy tắc Use Case (VD: Chuyển trạng thái đơn hàng `PENDING` -> `RESERVED`, tính điểm uy tín).
    * Không nạp DB, không phụ thuộc framework, chạy cực nhanh **< 2 giây**.
  * 🔺 **Tầng 2 (Giữa - 20%): Integration Test với Testcontainers**
    * Tự động kéo Docker image `postgres:16-alpine` thật trong CI.
    * Kiểm thử chính xác Flyway migration và truy vấn JPA repository.
  * 🔺 **Tầng 3 (Đỉnh - 10%): E2E Test (Playwright & Maestro)**
    * Playwright kiểm thử kịch bản Admin duyệt bài đăng đồ dùng trên Web.
    * Maestro giả lập luồng sinh viên đặt cọc và nhắn tin trên Mobile.

#### 🎙️ Lời thoại trình bày:
> *"Điểm cốt lõi nhất của bài seminar là: **CI/CD liên kết như thế nào với bản thiết kế OOAD?**  
> Nhóm chúng em áp dụng nguyên lý **Đảo ngược phụ thuộc (DIP)** để hiện thực hóa Tháp kiểm thử tự động:*
>
> *Ở tầng đáy – **Unit Test Nghiệp vụ**: Thiết kế OOAD chuẩn mực đòi hỏi Tầng Miền (Domain) phải độc lập hoàn toàn với hạ tầng. Vì vậy, các quy tắc ca sử dụng cốt lõi – như kiểm tra bất biến khi chuyển trạng thái đơn hàng sang 'Giữ chỗ', hay thuật toán tính điểm uy tín sinh viên – đều được kiểm thử bằng các bài test POJO thuần túy. Hàng chục bài test chạy trong **chưa đầy 2 giây**, giúp phát hiện vi phạm nghiệp vụ ngay lập tức.*
>
> *Ở tầng giữa – **Integration Test**: Để không rơi vào cái bẫy của database giả lập H2, CI sử dụng **Testcontainers** để tự động kéo một container PostgreSQL 16 thật trong Docker, kiểm chứng 100% các script Flyway migration và ánh xạ dữ liệu.*
>
> *Và ở tầng đỉnh – **E2E Testing trước phát hành**: Nhóm tích hợp **Playwright** cho Web và **Maestro** cho Mobile để tự động hóa kịch bản người dùng thật: từ thao tác Admin duyệt bài trên Web đến luồng sinh viên tìm kiếm và trao đổi đồ dùng trên Mobile, đảm bảo sản phẩm hoạt động trơn tru từ giao diện xuống đến database."*

---

### 🎙️ TỔNG KẾT & CHUYỂN GIAO SANG PHẦN 5 (3:40 – 3:55 | 15 giây)

> *(Mỉm cười, hướng ánh mắt về bạn Tô Thành Nguyên bên cạnh)*  
>
> *"Tóm lại, thông qua việc lựa chọn GitHub Actions và thiết kế pipeline đa tầng, nhóm đã tự động hóa hoàn toàn quy trình kiểm thử và đóng gói bản phát hành từ thiết kế OOAD ban đầu.*  
>
> *Vậy cụ thể tệp workflow YAML được cấu trúc ra sao, cơ chế bảo mật khóa Secrets như thế nào và sản phẩm chạy thực tế ra sao trên môi trường triển khai? Em xin nhường lại sân khấu cho **bạn Tô Thành Nguyên ở Phần 5** để mổ xẻ chi tiết và thực hiện phần Live Demo. Xin cảm ơn thầy cô và các bạn!"*

---

## Cẩm nang Trình bày Đỉnh cao & Tuyệt chiêu Trả lời Phản biện (Q&A Defense)

### 1. Bí quyết Làm chủ Sân khấu (Stage Presence)
* **Khẩu khí:** Giọng nói đĩnh đạc, tự tin, nhấn mạnh vào các từ khóa kỹ thuật: *Ephemeral VM, Zero-Ops, Branch Protection, Multi-stage, Domain Invariants, Testcontainers*.
* **Tương tác nhóm:** Lời mở đầu cảm ơn Phần 3 và lời kết chuyển giao sang Phần 5 tạo nên hình ảnh một **nhóm kỹ sư làm việc cực kỳ ăn ý, chuyên nghiệp và có tổ chức**, được các giảng viên đánh giá rất cao.
* **Thời gian:** Nếu thấy đồng hồ ở mốc 3:20 khi vừa nói xong Slide 4, bạn có thể nói lời kết từ tốn và kết thúc ở đúng mốc 3:45.

### 2. Bộ Câu hỏi Phản biện Trọng tâm dành riêng cho Phần 4

#### ❓ Câu hỏi 1 của Thầy/Cô: *"Em nói GitHub Actions dùng máy ảo Ephemeral VM tự hủy, vậy làm sao nó giữ được tốc độ build nhanh cho các lần chạy sau nếu không có cache ổ cứng như Jenkins?"*
> **Trả lời sắc bén:**  
> *"Dạ thưa thầy/cô, GitHub Actions giải quyết bài toán này bằng **hệ thống Cloud Cache phân tán** qua các Action chính chủ như `actions/cache`, `actions/setup-java` (cho Maven) và `actions/setup-node` (cho npm).  
> Trước khi một job kết thúc, hệ thống sẽ nén thư mục `.m2/repository` hoặc `node_modules` và tải lên kho lưu trữ cache tốc độ cao của GitHub dựa theo mã hash của file `pom.xml` hoặc `package-lock.json`. Khi có lượt chạy mới, máy ảo Ephemeral tải và giải nén cache về chỉ trong vài giây. Nhờ đó, nhóm vừa có được môi trường sạch tuyệt đối, vừa giữ được thời gian build cực nhanh chỉ 10-15 giây ạ."*

#### ❓ Câu hỏi 2 của Thầy/Cô: *"Tại sao nhóm lại dùng Testcontainers trong CI mà không dùng Docker Compose dựng sẵn PostgreSQL từ đầu?"*
> **Trả lời sắc bén:**  
> *"Dạ thưa thầy/cô, việc dùng Docker Compose tĩnh trong CI có hai nhược điểm lớn: thứ nhất là phải quản lý vòng đời khởi động/dọn dẹp container thủ công; thứ hai là dễ bị xung đột cổng mạng (port conflict) khi có nhiều job chạy song song.  
> Thư viện Testcontainers được tích hợp trực tiếp vào mã kiểm thử Java, nó tự động tìm cổng ngẫu nhiên khả dụng, khởi động container PostgreSQL thật độc lập cho từng tiến trình test và tự động dọn dẹp sạch sẽ ngay khi test xong (nhờ tiến trình Ryuk). Điều này giúp các bài kiểm thử đạt tính cô lập (Isolation) cao nhất theo đúng nguyên lý thiết kế hướng đối tượng ạ."*

#### ❓ Câu hỏi 3 của Thầy/Cô: *"Tại sao nhóm lại phân tách Unit Test nghiệp vụ chạy riêng không cần Database?"*
> **Trả lời sắc bén:**  
> *"Dạ thưa thầy/cô, đây chính là sự ứng dụng nguyên lý **Kiến trúc Sạch (Clean Architecture) và Phân tầng trong OOAD**. Tầng Domain chứa toàn bộ thực thể và quy tắc nghiệp vụ cốt lõi, không được phép phụ thuộc vào cơ sở dữ liệu hay thư viện ngoài.  
> Việc viết Pure Unit Test không phụ thuộc Spring Context hay DB giúp nhóm có được phản hồi tức thì dưới 2 giây. Lập trình viên có thể chạy kiểm thử liên tục trong lúc thiết kế lớp (TDD) mà không phải chờ đợi hàng phút để nạp container cơ sở dữ liệu ạ."*
