# LiveKit self-hosted SFU deployment: EC2 Auto Scaling Group with host networking.
# LiveKit requires direct UDP access on a port range (50000-60000) which Fargate
# cannot support well. Instances run in public subnets with public IPs so clients
# can connect directly for WebRTC media. WebSocket signaling is fronted by the ALB.
#
# All resources gated on var.livekit_enabled (default false). Requires public_dns_tls_enabled for TLS.

locals {
  livekit_enabled = var.livekit_enabled && local.public_dns_tls_enabled

  livekit_route53_record_name = local.livekit_enabled ? replace(var.livekit_domain, ".${local.route53_zone_root}", "") : ""

  tg_livekit_name = substr("${local.name_prefix}-lk", 0, 32)
}

# -----------------------------------------------------------------------------
# Secrets Manager - API key/secret reference
# The LiveKit API secret is stored in Secrets Manager and referenced by the
# API task (via api_container_secrets) and the EC2 instances at boot.
# -----------------------------------------------------------------------------

locals {
  livekit_secret_arn = local.livekit_enabled ? var.api_container_secrets["LIVEKIT_API_SECRET"] : ""
  livekit_secret_base_arn = local.livekit_enabled ? try(regex("^(.+):[^:]+::$", local.livekit_secret_arn)[0], local.livekit_secret_arn) : ""
}

check "livekit_secret_configured" {
  assert {
    condition = !local.livekit_enabled || (
      contains(keys(var.api_container_secrets), "LIVEKIT_API_SECRET") &&
      length(trimspace(var.api_container_secrets["LIVEKIT_API_SECRET"])) > 0
    )
    error_message = "livekit_enabled requires a non-empty api_container_secrets[\"LIVEKIT_API_SECRET\"] ARN."
  }
}

# -----------------------------------------------------------------------------
# ACM Certificate for LiveKit domain
# -----------------------------------------------------------------------------

resource "aws_acm_certificate" "livekit" {
  count = local.livekit_enabled ? 1 : 0

  domain_name       = var.livekit_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

resource "aws_route53_record" "cert_validation_livekit" {
  for_each = local.livekit_enabled ? {
    for dvo in aws_acm_certificate.livekit[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.public[0].zone_id
}

resource "aws_acm_certificate_validation" "livekit" {
  count = local.livekit_enabled ? 1 : 0

  certificate_arn = aws_acm_certificate.livekit[0].arn
  validation_record_fqdns = [
    for r in aws_route53_record.cert_validation_livekit : r.fqdn
  ]
}

# -----------------------------------------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "livekit" {
  count = local.livekit_enabled ? 1 : 0

  name              = "/ec2/${local.name_prefix}/livekit"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# Security Group
# -----------------------------------------------------------------------------

resource "aws_security_group" "livekit" {
  count = local.livekit_enabled ? 1 : 0

  name        = "${local.name_prefix}-livekit"
  description = "LiveKit SFU for ${local.name_prefix}"
  vpc_id      = module.vpc.vpc_id

  # WebSocket signaling from ALB
  ingress {
    description     = "WebSocket signaling from ALB"
    from_port       = 7880
    to_port         = 7880
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # TURN/TLS from internet (fallback when UDP is blocked)
  ingress {
    description = "TURN/TLS from internet"
    from_port   = 7881
    to_port     = 7881
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # WebRTC UDP media from internet
  ingress {
    description = "WebRTC UDP media"
    from_port   = 50000
    to_port     = 60000
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Health check from ALB (HTTP on 7880)
  ingress {
    description     = "Health check from ALB"
    from_port       = 7880
    to_port         = 7880
    protocol        = "tcp"
    cidr_blocks     = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-livekit" })
}

# -----------------------------------------------------------------------------
# IAM - Instance Profile for LiveKit EC2 instances
# Grants: ECR pull, Secrets Manager read, CloudWatch Logs, SSM for debugging
# -----------------------------------------------------------------------------

resource "aws_iam_role" "livekit_instance" {
  count = local.livekit_enabled ? 1 : 0

  name = "${local.name_prefix}-livekit-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "livekit_instance" {
  count = local.livekit_enabled ? 1 : 0

  name = "${local.name_prefix}-livekit-instance"
  role = aws_iam_role.livekit_instance[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SecretsManagerRead"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [local.livekit_secret_base_arn]
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
        ]
        Resource = ["${aws_cloudwatch_log_group.livekit[0].arn}:*"]
      },
      {
        Sid    = "ECRPull"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Resource = ["*"]
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "livekit_ssm" {
  count = local.livekit_enabled ? 1 : 0

  role       = aws_iam_role.livekit_instance[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "livekit" {
  count = local.livekit_enabled ? 1 : 0

  name = "${local.name_prefix}-livekit"
  role = aws_iam_role.livekit_instance[0].name

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# Launch Template
# Amazon Linux 2023 with Docker, pulls and runs livekit/livekit-server.
# Uses host networking so all ports are directly accessible.
# -----------------------------------------------------------------------------

data "aws_ssm_parameter" "al2023_arm64_ami" {
  count = local.livekit_enabled ? 1 : 0

  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_launch_template" "livekit" {
  count = local.livekit_enabled ? 1 : 0

  name_prefix   = "${local.name_prefix}-livekit-"
  image_id      = data.aws_ssm_parameter.al2023_arm64_ami[0].value
  instance_type = var.livekit_instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.livekit[0].arn
  }

  network_interfaces {
    associate_public_ip_address = true
    security_groups             = [aws_security_group.livekit[0].id]
  }

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
    http_endpoint               = "enabled"
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(local.common_tags, {
      Name = "${local.name_prefix}-livekit"
    })
  }

  user_data = base64encode(templatefile("${path.module}/templates/livekit-userdata.sh.tpl", {
    aws_region         = var.aws_region
    secret_arn         = local.livekit_secret_base_arn
    livekit_api_key    = var.livekit_api_key
    livekit_domain     = var.livekit_domain
    redis_url          = var.create_elasticache_redis ? "redis://${aws_elasticache_replication_group.redis[0].primary_endpoint_address}:6379" : ""
    log_group          = aws_cloudwatch_log_group.livekit[0].name
    port_range_start   = 50000
    port_range_end     = 60000
  }))

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# Auto Scaling Group
# Instances in public subnets for direct UDP access.
# -----------------------------------------------------------------------------

resource "aws_autoscaling_group" "livekit" {
  count = local.livekit_enabled ? 1 : 0

  name_prefix         = "${local.name_prefix}-livekit-"
  min_size            = var.livekit_min_count
  max_size            = var.livekit_max_count
  desired_capacity    = var.livekit_min_count
  vpc_zone_identifier = module.vpc.public_subnets
  target_group_arns   = [aws_lb_target_group.livekit[0].arn]

  health_check_type         = "ELB"
  health_check_grace_period = 120

  launch_template {
    id      = aws_launch_template.livekit[0].id
    version = "$Latest"
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
    }
  }

  tag {
    key                 = "Name"
    value               = "${local.name_prefix}-livekit"
    propagate_at_launch = true
  }

  dynamic "tag" {
    for_each = local.common_tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  lifecycle {
    ignore_changes = [desired_capacity]
  }
}

# -----------------------------------------------------------------------------
# Auto Scaling Policy - Target tracking on CPU
# -----------------------------------------------------------------------------

resource "aws_autoscaling_policy" "livekit_cpu" {
  count = local.livekit_enabled ? 1 : 0

  name                   = "${local.name_prefix}-livekit-cpu-tt"
  autoscaling_group_name = aws_autoscaling_group.livekit[0].name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 50.0
  }
}

# -----------------------------------------------------------------------------
# ALB Target Group + Listener Rule (WebSocket signaling via existing ALB)
# LiveKit WebSocket connections are upgradeable HTTP, suitable for ALB.
# -----------------------------------------------------------------------------

resource "aws_lb_target_group" "livekit" {
  count = local.livekit_enabled ? 1 : 0

  name        = local.tg_livekit_name
  port        = 7880
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "instance"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/"
    matcher             = "200"
    protocol            = "HTTP"
    port                = "7880"
  }

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = true
  }

  deregistration_delay = 30

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-livekit-tg" })
}

resource "aws_lb_listener_rule" "livekit" {
  count = local.livekit_enabled ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 14

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.livekit[0].arn
  }

  condition {
    host_header {
      values = [var.livekit_domain]
    }
  }
}

resource "aws_lb_listener_certificate" "livekit" {
  count = local.livekit_enabled ? 1 : 0

  listener_arn    = aws_lb_listener.https[0].arn
  certificate_arn = aws_acm_certificate_validation.livekit[0].certificate_arn
}

# -----------------------------------------------------------------------------
# Route 53 Records
# Points the livekit domain at the ALB for WebSocket signaling.
# Clients connect via wss://livekit.adieuu.com, then LiveKit nodes advertise
# their public IPs for direct UDP media connections.
# -----------------------------------------------------------------------------

resource "aws_route53_record" "livekit_alias" {
  count = local.livekit_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.public[0].zone_id
  name    = local.livekit_route53_record_name
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "livekit_alias_aaaa" {
  count = local.livekit_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.public[0].zone_id
  name    = local.livekit_route53_record_name
  type    = "AAAA"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
