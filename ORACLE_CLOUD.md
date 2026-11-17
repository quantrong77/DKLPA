# Deploy lên Oracle Cloud Infrastructure (OCI)

> Dành cho nhánh `deploy/oracle-cloud`. Nhánh `main` tiếp tục dùng cho Render; nhánh `deploy/koyeb` được giữ riêng.

Ứng dụng vẫn dùng Supabase cho đăng nhập và PostgreSQL. OCI chạy server Node.js trong Docker, còn Caddy nhận HTTPS và chuyển tiếp request vào server.

## 1. Tạo VM Always Free

1. Tạo tài khoản OCI và chọn **Home Region** gần người dùng, chẳng hạn Singapore nếu có trong danh sách. Tài nguyên Always Free Compute chỉ tạo được trong Home Region.
2. Mở **Compute → Instances → Create instance**. Chọn image Ubuntu ARM64 được đánh dấu **Always Free Eligible**, shape `VM.Standard.A1.Flex`, ban đầu có thể chọn 1 OCPU và 6 GB RAM. Nếu hết capacity, thử availability domain khác hoặc đợi rồi thử lại.
3. Tạo hoặc chọn VCN với **public subnet**, gán public IPv4, và lưu SSH private key về máy của bạn.
4. Trong security list hoặc network security group của VM, thêm ingress:
   - TCP 22 chỉ từ IP công cộng của bạn (để SSH).
   - TCP 80 và 443 từ `0.0.0.0/0` (HTTP redirect và HTTPS).
5. Tạo bản ghi DNS `A` cho hostname bạn sở hữu, trỏ tới public IPv4 của VM, ví dụ `dkct.example.com`.

OCI có thể thu hồi VM Always Free nếu trong 7 ngày mức sử dụng CPU (phân vị 95) dưới 20%, mạng dưới 20% và, với A1, bộ nhớ dưới 20%. Khả năng tạo A1 cũng tùy capacity của Home Region; xem [điều kiện và tài nguyên Always Free của OCI](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

## 2. Cài Docker và lấy mã nguồn

SSH vào VM bằng private key đã tải khi tạo máy. Với Ubuntu, dùng repository chính thức của [Docker Engine](https://docs.docker.com/engine/install/ubuntu/):

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker

git clone --branch deploy/oracle-cloud https://github.com/quantrong77/DKLPA.git dkct-module
cd dkct-module
```

## 3. Cấu hình biến môi trường

Tạo file `.env` ở thư mục gốc của repo:

```bash
nano .env
chmod 600 .env
```

Điền các biến hiện có từ Render hoặc `standalone/.env.example`:

```dotenv
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-public-key>
ADMIN_EMAILS=email-cua-ban@example.com
DKCT_SECRET_KEY=<gia-tri-dang-dung-tren-Render>
DOMAIN=dkct.example.com
```

Giữ nguyên `DKCT_SECRET_KEY` đang dùng trên Render để đọc các mật khẩu trang lịch/Zalo đã mã hóa trong database. Thay `DOMAIN` bằng hostname có DNS trỏ về VM. Không commit `.env` lên GitHub.

## 4. Khởi chạy

Đảm bảo DNS đã cập nhật và OCI cho phép cổng 80/443, rồi chạy:

```bash
sudo docker compose -f compose.oracle.yaml up -d --build
sudo docker compose -f compose.oracle.yaml logs --tail=100 -f
```

Mở `https://<hostname>` và kiểm tra `https://<hostname>/healthz`. Caddy sẽ tự xin và gia hạn chứng chỉ khi hostname trỏ đúng public IP và máy truy cập được từ internet trên cổng 80/443. Xem [hướng dẫn HTTPS của Caddy](https://caddyserver.com/docs/automatic-https).

## Cập nhật sau này

```bash
cd ~/dkct-module
git pull --ff-only origin deploy/oracle-cloud
sudo docker compose -f compose.oracle.yaml up -d --build
```

`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_EMAILS` và `DKCT_SECRET_KEY` là các giá trị cần được bảo vệ. Sao lưu database trên Supabase; volume Caddy chỉ giữ dữ liệu chứng chỉ.
