# TikTok Kingdom Clash — Avatar Survival

Game tương tác TikTok Live, giao diện responsive cho điện thoại, màn hình dọc và OBS.

## Chạy local

Yêu cầu Node.js >=22.13 (khuyến nghị Node 24), npm >=10.

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
npm ci
npm run dev
```

Chỉ sao chép file môi trường nếu chưa tồn tại, tránh ghi đè cấu hình cá nhân.

- Game: http://localhost:3000
- Thử sự kiện: http://localhost:3000/?debug=1
- Backend: http://127.0.0.1:4100/health

Mặc định chạy Mock với 16 người, không cần API key. Bật âm thanh bằng nút loa; trình duyệt cần một lần tương tác trước khi phát tiếng. Avatar TikTok được lấy từ profile; ảnh lỗi hoặc thiếu ảnh sẽ dùng chữ cái tên.

## Luật chơi

| Sự kiện | Tác dụng |
| --- | --- |
| Người xem vào Live | Tự vào phe đang ít người sống sót hơn; ngẫu nhiên nếu cân bằng. Có 1 avatar cấp 1, 100 HP |
| 1 tim | 1 phát bắn, trừ 2 HP của đối thủ |
| Hoa hồng / Rose | Mỗi hoa cộng 1 điểm khiên, hấp thụ 1 HP sát thương |
| Rosa | 1 phát bắn trừ 10 HP |
| Heo may mắn / Lucky Pig | Nâng cấp 2, đặt HP và HP tối đa thành 200 |
| Hạc giấy / Paper Crane | Tiêu diệt 1 đối thủ |
| Súng bắn tiền / Money Gun | Tiêu diệt tối đa 10 đối thủ khác nhau |
| Thiên hà / Galaxy | Tiêu diệt tối đa 20 đối thủ khác nhau |

- Khiên cộng dồn theo số hoa của từng người và giữ lại đến khi nhận sát thương hoặc kết thúc vòng. 10 hoa = 10 điểm khiên: nhận 6 sát thương còn 4 khiên, HP nhân vật không giảm; nhận 12 sát thương hết khiên và mất 2 HP. Một tim gây 2 sát thương nên tiêu hao 2 khiên; Rosa gây 10 sát thương nên tiêu hao tối đa 10 khiên, phần dư trừ HP. Tặng thêm hoa cộng vào số còn lại, không đặt lại khiên. Nâng cấp Heo giữ nguyên điểm khiên.
- Các quà tiêu diệt bỏ qua HP và khiên. Không gây sát thương đồng đội.
- Cấp 2 không thể nâng tiếp và tặng thêm Heo không hồi máu.
- Người bị loại chờ vòng tiếp theo; vào lại, tim hoặc tặng quà không cấp thêm mạng trong cùng vòng.
- Người tham gia được giữ lại và hồi sinh khi chủ phòng bắt đầu vòng tiếp theo. Đổi nguồn Mock/Live bắt đầu một vòng sạch.
- Chat/tim/quà đầu tiên cũng có thể đăng ký người chơi nếu nguồn Live bỏ lỡ sự kiện vào phòng.
- Chỉ tên quà được ánh xạ (không phân biệt hoa thường và dấu tiếng Việt), không dùng giá xu để suy đoán.
- Gift streak áp dụng ở sự kiện kết thúc với số lượng cuối cùng; Hoa hồng cộng đủ số lượng trong một lần cập nhật, các quà khác tối đa 100 quà trong một sự kiện.
- Tim dùng số lượng trong từng sự kiện, không dùng tổng tim phòng. Mỗi người giữ một mục tiêu cho đến khi đối thủ bị hạ, kể cả tim đến qua nhiều sự kiện riêng. 10 tim gây 20 HP sát thương; 60 tim hạ đối thủ 100 HP và gây thêm 20 HP cho một đồng đội của đối thủ (khi không có khiên). Các phát còn lại chuyển ngay sang đối thủ tiếp theo, dừng khi hết phe đối thủ; không bắn đồng đội. Sát thương trừ điểm khiên trước, phần còn lại mới trừ HP. Server gộp các phát cùng mục tiêu để tránh nghẽn, và xóa mục tiêu đã chọn khi bắt đầu vòng mới.
- Đấu trường tối đa 400 avatar sống cùng lúc. Người mới khi đầy không được cấp nhân vật; tương tác sau khi có chỗ trống có thể tham gia.
- Sự kiện Live phụ thuộc dữ liệu TikTok/Euler cung cấp; không có danh sách đầy đủ người đã xem trước khi kết nối. Tim có thể được nền tảng gộp hoặc gửi thưa.

## Kết thúc vòng

Server quản lý thời gian (mặc định 10 phút). Hết giờ, dừng nhận hành động và chốt bảng kết quả, không tự lặp đồng hồ.

Phe thắng có nhiều người sống sót hơn; bằng nhau là hòa. Xếp hạng cá nhân: sống sót trước, sau đó số hạ gục, HP còn lại, thời gian sống sót; user ID dùng để chốt thứ tự nếu vẫn bằng nhau. Bảng tổng kết hiển thị 10 giây, sau đó server tự bắt đầu vòng mới và hồi sinh người tham gia. Đồng hồ đếm ngược được đồng bộ tới mọi màn hình. Kết quả lưu trong bộ nhớ và mất khi khởi động lại backend.

Bảng tổng kết có top 3 và toàn bộ danh sách. Chủ phòng có thể bấm **Bắt đầu vòng tiếp theo**. Lưu thời lượng trong cài đặt cũng bắt đầu vòng mới và xóa điểm vòng cũ.

## TikTok Live

Cấu hình trong `backend/.env`:

```env
EULER_API_KEY=your_key
```

Mở cài đặt, nhập @username hoặc link TikTok Live, chọn **Lưu & kết nối Live**. Nguồn Euler nhận WebcastMemberMessage (actionId=1), WebcastLikeMessage (likeCount), chat và gift. Bộ nhớ chống lặp giữ 10.000 message ID gần nhất. API key không trả về frontend.

Kết nối chỉ chuyển xanh khi nhận xác nhận TikTok hoặc sự kiện Live, không chỉ thông tin phòng. Lỗi tạm thời (WS State Error, mất mạng, lỗi upstream, kết nối hết hạn) tự thử lại sau 5, 10, 20, 40 rồi tối đa 60 giây; lỗi giới hạn kết nối bắt đầu chờ 30 giây. Chỉ đặt lại nhịp thử khi kết nối ổn định 30 giây. Thử lại giữ nguyên trận và bộ nhớ chống lặp; đổi nguồn hủy mọi lần thử đang chờ. API trả HTTP 202 khi đang chờ thử lại, kèm `source.retryAt`, `retryAttempt` và `errorCode` khi có lỗi. Trạng thái trong cài đặt cập nhật trực tiếp khi phục hồi.

Sai key/quyền, sai cấu hình, tài khoản chưa live hoặc phiên đã kết thúc sẽ dừng và báo nguyên nhân để chủ phòng xử lý. Kiểm tra `GET /api/settings` hoặc `/health` để xem trạng thái và mã lỗi. Backend không gửi URL chứa key hoặc thông báo lỗi thô của thư viện ra giao diện.

Backend mặc định chỉ bind 127.0.0.1; các API điều khiển dành cho máy của chủ phòng. Giao diện tự thích ứng kích thước trình duyệt; để truy cập từ điện thoại khác trong mạng cần cấu hình HOST, CLIENT_ORIGIN và NEXT_PUBLIC_GAME_SERVER_URL phù hợp.

## Mock và OBS

Đặt `MOCK_INTERVAL_MS=0` nếu muốn chỉ thao tác thủ công, không phát tim/quà tự động. Trang `?debug=1` có chọn người chơi, thêm người vào Live, tim, mọi loại quà và kết thúc vòng. Các API mock bị khóa khi đang ở Live.

- OBS dọc: Browser Source 1080 × 1920.
- OBS ngang: Browser Source 1920 × 1080.
- Dùng URL thường để không hiển thị bảng thử nghiệm; bật âm thanh qua chức năng Interact của OBS.
- Hai phe hiển thị cạnh nhau; đấu trường tự thu nhỏ avatar theo số người và diện tích màn hình để hiện đủ người, không cuộn. Bảng hạng vẫn có thể cuộn.
- Hỗ trợ giảm chuyển động theo cài đặt hệ điều hành.

API: POST `/api/mock/join` với `{viewer}`, POST `/api/mock/like` với `{viewer,count}`, POST `/api/mock/gift` với `{viewer,giftName,repeatCount}`, POST `/api/mock/finish`, POST `/api/round/restart`.

## Kiểm tra

```bash
npm run typecheck
npm test
npm run build
```

## Đấu trường người que

Nhân vật chạy trong nửa sân của đội, dùng avatar TikTok làm đầu, thanh HP trên đầu và tên dưới chân. Khi đông, toàn bộ nhân vật tự thu nhỏ và chia khu vực di chuyển để không chồng lên nhau. Chạm nhân vật để xem tên, HP và cấp độ đầy đủ.

Đạn xuất phát từ súng, có chớp đầu nòng, giật súng, phản ứng trúng đạn và rung sân. Chế độ giảm chuyển động của hệ điều hành tắt chạy/rung nhưng giữ thông tin trận đấu. Canvas chạy tối đa 30 FPS, dừng khi tab bị ẩn.

Tiếng súng dùng mẫu ghi âm, được cắt ngắn và cân mức; có bộ nén âm và giới hạn số mẫu phát cùng lúc. Nguồn và giấy phép: frontend/public/audio/CREDITS.txt (Vincent Sevedge / Tabasco, CC BY 3.0 theo ghi chú trong gói gốc).
