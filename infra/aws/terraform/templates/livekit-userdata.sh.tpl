#!/bin/bash
set -euo pipefail

# LiveKit SFU instance bootstrap script.
# Installs Docker, retrieves secrets from AWS Secrets Manager, and runs the
# LiveKit server container with host networking for direct UDP media access.

exec > >(tee /var/log/livekit-userdata.log) 2>&1

echo "[livekit] Starting bootstrap $(date -u +%FT%TZ)"

# --- Install Docker ---
dnf install -y docker jq aws-cli
systemctl enable docker
systemctl start docker

# --- Retrieve API secret from Secrets Manager ---
REGION="${aws_region}"
SECRET_ARN="${secret_arn}"

LIVEKIT_API_SECRET=$(aws secretsmanager get-secret-value \
  --region "$REGION" \
  --secret-id "$SECRET_ARN" \
  --query SecretString \
  --output text | jq -r '.LIVEKIT_API_SECRET // .')

LIVEKIT_API_KEY="${livekit_api_key}"
LIVEKIT_DOMAIN="${livekit_domain}"
REDIS_URL="${redis_url}"
PORT_RANGE_START="${port_range_start}"
PORT_RANGE_END="${port_range_end}"
WEBHOOK_URL="${webhook_url}"

# --- Detect public IP (for WebRTC candidate advertisement) ---
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/public-ipv4)

echo "[livekit] Public IP: $PUBLIC_IP"

# --- Write LiveKit config ---
mkdir -p /etc/livekit
cat > /etc/livekit/config.yaml <<EOF
port: 7880
rtc:
  port_range_start: $PORT_RANGE_START
  port_range_end: $PORT_RANGE_END
  use_external_ip: true
  tcp_port: 7881
  enable_loopback_candidate: false
keys:
  $LIVEKIT_API_KEY: $LIVEKIT_API_SECRET
logging:
  level: info
$(if [ -n "$WEBHOOK_URL" ]; then
cat <<WEBHOOK
webhook:
  api_key: $LIVEKIT_API_KEY
  urls:
    - $WEBHOOK_URL
WEBHOOK
fi)
$(if [ -n "$REDIS_URL" ]; then
cat <<REDIS
redis:
  address: $(echo "$REDIS_URL" | sed 's|redis://||')
REDIS
fi)
EOF

chmod 600 /etc/livekit/config.yaml

# --- Run LiveKit container with host networking ---
docker run -d \
  --name livekit \
  --restart unless-stopped \
  --network host \
  -v /etc/livekit/config.yaml:/etc/livekit.yaml:ro \
  livekit/livekit-server:latest \
  --config /etc/livekit.yaml \
  --node-ip "$PUBLIC_IP"

echo "[livekit] Container started, waiting for health..."

# --- Wait for LiveKit to be healthy ---
for i in $(seq 1 30); do
  if curl -sf http://localhost:7880 > /dev/null 2>&1; then
    echo "[livekit] Healthy after $${i}s"
    break
  fi
  sleep 1
done

echo "[livekit] Bootstrap complete $(date -u +%FT%TZ)"
