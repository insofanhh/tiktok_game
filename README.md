# TikTok Kingdom Clash

Web game 2D realtime cho TikTok Live, thiết kế để chạy trong OBS Browser Source. Người xem được xếp phe ngẫu nhiên bằng quà 1 xu; các mốc giá quà khác được chuyển thành hành động xây, tạo khiên hoặc tấn công.

## Yêu cầu

- Node.js 22.13 trở lên
- npm 10 trở lên

## Chạy local

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm install
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4100`
- Bảng điều khiển mock: `http://localhost:3000/?debug=1`

Backend mặc định dùng `TIKTOK_MODE=mock`, tự tạo user và gift để kiểm thử toàn bộ vòng lặp game. Đặt `MOCK_INTERVAL_MS=0` nếu chỉ muốn bắn sự kiện bằng bảng điều khiển hoặc HTTP API.

## Gift mapping

| Gift | Hành động |
| --- | --- |
| Rose / Hoa hồng hoặc quà 1 xu | Chọn phe Xanh/Đỏ ngẫu nhiên |
| Quà 5 xu | Nhà của người tặng bắn nhà đối thủ, trừ 1 HP |
| Rosa hoặc quà 10 xu | Xây một nhà có 10 HP |
| Quà 20 xu | Tạo khiên cho một nhà của người tặng; chặn một phát bắn thường |
| Quà trên 100 xu | Phá hủy ngay một nhà đối thủ, bỏ qua khiên và HP |

## Kết nối TikTok thật

API key Euler vẫn được giữ kín trong `backend/.env`:

```env
EULER_API_KEY=euler_api_key_cua_ban
```

Sau khi backend chạy, bấm nút bánh răng trên thanh đầu game, nhập `@username` hoặc dán URL TikTok Live rồi chọn **Lưu & kết nối Live**. Username và chế độ nguồn được lưu trong `backend/data/runtime-settings.json`, vì vậy không cần sửa code hoặc nhập lại sau mỗi lần khởi động. Có thể bấm **Dùng Mock** để quay về dữ liệu giả lập.

Backend chỉ bind vào `127.0.0.1`; API cài đặt không trả Euler API key về frontend. Kết nối Live dùng WebSocket managed của Euler Stream nên hoạt động với gói Community; adapter xử lý gift streak khi sự kiện kết thúc để tránh tính trùng quà.

## Mock HTTP API

```bash
curl -X POST http://127.0.0.1:4100/api/mock/gift \
  -H "Content-Type: application/json" \
  -d '{"viewer":{"userId":"u1","uniqueId":"demo","nickname":"Demo"},"giftName":"Rose","diamondCount":1,"repeatCount":1}'

curl -X POST http://127.0.0.1:4100/api/mock/gift \
  -H "Content-Type: application/json" \
  -d '{"viewer":{"userId":"u1","uniqueId":"demo","nickname":"Demo"},"giftName":"Rosa","diamondCount":10,"repeatCount":1}'
```

## OBS

Thêm Browser Source với kích thước `1920x1080`, trỏ đến URL frontend và bật tùy chọn tắt source khi không hiển thị nếu muốn giải phóng GPU. URL bình thường không hiện bảng debug.

## Kiểm tra

```bash
npm run typecheck
npm test
npm run build
```
