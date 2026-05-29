# Jitsi Meet self-hosted deployment: signaling (Prosody + Jicofo + Web) + JVB (Videobridge).
# All resources gated on var.jitsi_enabled (default false). Requires public_dns_tls_enabled for TLS.

locals {
  jitsi_enabled = var.jitsi_enabled && local.public_dns_tls_enabled

  jitsi_route53_record_name     = local.jitsi_enabled ? replace(var.jitsi_domain, ".${local.route53_zone_root}", "") : ""
  jitsi_media_route53_record_name = local.jitsi_enabled ? "jitsi-media.${local.jitsi_route53_record_name}" : ""

  jitsi_xmpp_domain = var.jitsi_domain

  tg_jitsi_signal_name = substr("${local.name_prefix}-jitsi-sig", 0, 32)
  nlb_jitsi_name       = substr("${local.name_prefix}-jitsi-nlb", 0, 32)
  tg_jitsi_jvb_name    = substr("${local.name_prefix}-jitsi-jvb", 0, 32)
}

# -----------------------------------------------------------------------------
# ECR Repositories
# -----------------------------------------------------------------------------

resource "aws_ecr_repository" "jitsi_signal" {
  count = local.jitsi_enabled ? 1 : 0

  name                 = "${local.name_prefix}-jitsi-signal"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_ecr_lifecycle_policy" "jitsi_signal" {
  count = local.jitsi_enabled ? 1 : 0

  repository = aws_ecr_repository.jitsi_signal[0].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_repository" "jitsi_jvb" {
  count = local.jitsi_enabled ? 1 : 0

  name                 = "${local.name_prefix}-jitsi-jvb"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_ecr_lifecycle_policy" "jitsi_jvb" {
  count = local.jitsi_enabled ? 1 : 0

  repository = aws_ecr_repository.jitsi_jvb[0].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# -----------------------------------------------------------------------------
# CloudWatch Log Groups
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "jitsi_signal" {
  count = local.jitsi_enabled ? 1 : 0

  name              = "/ecs/${local.name_prefix}/jitsi-signal"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "jitsi_jvb" {
  count = local.jitsi_enabled ? 1 : 0

  name              = "/ecs/${local.name_prefix}/jitsi-jvb"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# Secrets Manager - JWT secret reference
# The Jitsi JWT secret is stored as a key inside the existing API secret
# (adieuu/prod/api:JITSI_JWT_SECRET::), passed via var.api_container_secrets.
# -----------------------------------------------------------------------------

locals {
  # The full ARN with :key:: suffix, used by ECS task secrets (valueFrom)
  jitsi_jwt_secret_arn = local.jitsi_enabled ? lookup(var.api_container_secrets, "JITSI_JWT_SECRET", "") : ""
  # Base secret ARN (strip :key:: suffix) for IAM Resource grants
  jitsi_jwt_secret_base_arn = local.jitsi_enabled ? try(regex("^(.+):[^:]+::$", local.jitsi_jwt_secret_arn)[0], local.jitsi_jwt_secret_arn) : ""
}

# -----------------------------------------------------------------------------
# ACM Certificate for Jitsi domain
# -----------------------------------------------------------------------------

resource "aws_acm_certificate" "jitsi" {
  count = local.jitsi_enabled ? 1 : 0

  domain_name       = var.jitsi_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

resource "aws_route53_record" "cert_validation_jitsi" {
  for_each = local.jitsi_enabled ? {
    for dvo in aws_acm_certificate.jitsi[0].domain_validation_options : dvo.domain_name => {
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

resource "aws_acm_certificate_validation" "jitsi" {
  count = local.jitsi_enabled ? 1 : 0

  certificate_arn = aws_acm_certificate.jitsi[0].arn
  validation_record_fqdns = [
    for r in aws_route53_record.cert_validation_jitsi : r.fqdn
  ]
}

# -----------------------------------------------------------------------------
# Security Groups
# -----------------------------------------------------------------------------

resource "aws_security_group" "jitsi_signal" {
  count = local.jitsi_enabled ? 1 : 0

  name        = "${local.name_prefix}-jitsi-signal"
  description = "Jitsi signal (Prosody/Jicofo/Web) for ${local.name_prefix}"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "HTTPS from ALB"
    from_port       = 8443
    to_port         = 8443
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "HTTP from ALB (health check)"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "XMPP from JVB"
    from_port       = 5222
    to_port         = 5222
    protocol        = "tcp"
    security_groups = [aws_security_group.jitsi_jvb[0].id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-jitsi-signal" })
}

resource "aws_security_group" "jitsi_jvb" {
  count = local.jitsi_enabled ? 1 : 0

  name        = "${local.name_prefix}-jitsi-jvb"
  description = "Jitsi Videobridge for ${local.name_prefix}"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "UDP media from NLB"
    from_port   = 10000
    to_port     = 10000
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "TCP health check from NLB"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-jitsi-jvb" })
}

# -----------------------------------------------------------------------------
# ALB Target Group + Listener Rule (Signal - HTTPS via existing ALB)
# -----------------------------------------------------------------------------

resource "aws_lb_target_group" "jitsi_signal" {
  count = local.jitsi_enabled ? 1 : 0

  name        = local.tg_jitsi_signal_name
  port        = 8443
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/about/health"
    matcher             = "200"
    protocol            = "HTTP"
    port                = "80"
  }

  deregistration_delay = 30

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-jitsi-signal-tg" })
}

resource "aws_lb_listener_rule" "jitsi_signal" {
  count = local.jitsi_enabled ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 15

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.jitsi_signal[0].arn
  }

  condition {
    host_header {
      values = [var.jitsi_domain]
    }
  }
}

resource "aws_lb_listener_certificate" "jitsi" {
  count = local.jitsi_enabled ? 1 : 0

  listener_arn    = aws_lb_listener.https[0].arn
  certificate_arn = aws_acm_certificate_validation.jitsi[0].certificate_arn
}

# -----------------------------------------------------------------------------
# NLB (Network Load Balancer) for JVB UDP media traffic
# -----------------------------------------------------------------------------

resource "aws_lb" "jitsi_nlb" {
  count = local.jitsi_enabled ? 1 : 0

  name               = local.nlb_jitsi_name
  load_balancer_type = "network"
  subnets            = module.vpc.public_subnets

  enable_cross_zone_load_balancing = true

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-jitsi-nlb" })
}

resource "aws_lb_target_group" "jitsi_jvb" {
  count = local.jitsi_enabled ? 1 : 0

  name        = local.tg_jitsi_jvb_name
  port        = 10000
  protocol    = "UDP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    interval            = 30
    port                = "8080"
    protocol            = "TCP"
  }

  deregistration_delay = 30

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-jitsi-jvb-tg" })
}

resource "aws_lb_listener" "jitsi_jvb_udp" {
  count = local.jitsi_enabled ? 1 : 0

  load_balancer_arn = aws_lb.jitsi_nlb[0].arn
  port              = 10000
  protocol          = "UDP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.jitsi_jvb[0].arn
  }
}

# -----------------------------------------------------------------------------
# ECS Task Definitions
# -----------------------------------------------------------------------------

resource "aws_ecs_task_definition" "jitsi_signal" {
  count = local.jitsi_enabled ? 1 : 0

  family                   = "${local.name_prefix}-jitsi-signal"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.jitsi_signal_cpu
  memory                   = var.jitsi_signal_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = "jitsi-signal"
      image     = "${aws_ecr_repository.jitsi_signal[0].repository_url}:${var.jitsi_signal_image_tag}"
      essential = true
      portMappings = [
        { containerPort = 8443, protocol = "tcp" },
        { containerPort = 80, protocol = "tcp" },
        { containerPort = 5222, protocol = "tcp" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.jitsi_signal[0].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "jitsi-signal"
        }
      }
      environment = [
        { name = "ENABLE_AUTH", value = "1" },
        { name = "AUTH_TYPE", value = "jwt" },
        { name = "JWT_APP_ID", value = var.jitsi_jwt_app_id },
        { name = "JWT_ACCEPTED_ISSUERS", value = var.jitsi_jwt_issuer },
        { name = "JWT_ACCEPTED_AUDIENCES", value = var.jitsi_jwt_app_id },
        { name = "XMPP_DOMAIN", value = local.jitsi_xmpp_domain },
        { name = "XMPP_AUTH_DOMAIN", value = "auth.${local.jitsi_xmpp_domain}" },
        { name = "XMPP_MUC_DOMAIN", value = "muc.${local.jitsi_xmpp_domain}" },
        { name = "XMPP_INTERNAL_MUC_DOMAIN", value = "internal-muc.${local.jitsi_xmpp_domain}" },
        { name = "XMPP_GUEST_DOMAIN", value = "guest.${local.jitsi_xmpp_domain}" },
        { name = "XMPP_RECORDER_DOMAIN", value = "recorder.${local.jitsi_xmpp_domain}" },
        { name = "PUBLIC_URL", value = "https://${var.jitsi_domain}" },
        { name = "JVB_BREWERY_MUC", value = "jvbbrewery" },
        { name = "TZ", value = "UTC" },
      ]
      secrets = [
        { name = "JWT_APP_SECRET", valueFrom = local.jitsi_jwt_secret_arn }
      ]
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "jitsi_jvb" {
  count = local.jitsi_enabled ? 1 : 0

  family                   = "${local.name_prefix}-jitsi-jvb"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.jitsi_jvb_cpu
  memory                   = var.jitsi_jvb_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = "jitsi-jvb"
      image     = "${aws_ecr_repository.jitsi_jvb[0].repository_url}:${var.jitsi_jvb_image_tag}"
      essential = true
      portMappings = [
        { containerPort = 10000, protocol = "udp" },
        { containerPort = 8080, protocol = "tcp" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.jitsi_jvb[0].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "jitsi-jvb"
        }
      }
      environment = [
        { name = "JVB_PORT", value = "10000" },
        { name = "JVB_STUN_SERVERS", value = "stun.l.google.com:19302,stun1.l.google.com:19302" },
        { name = "XMPP_SERVER", value = var.jitsi_domain },
        { name = "XMPP_DOMAIN", value = local.jitsi_xmpp_domain },
        { name = "XMPP_AUTH_DOMAIN", value = "auth.${local.jitsi_xmpp_domain}" },
        { name = "XMPP_INTERNAL_MUC_DOMAIN", value = "internal-muc.${local.jitsi_xmpp_domain}" },
        { name = "JVB_BREWERY_MUC", value = "jvbbrewery" },
        { name = "JVB_TCP_HARVESTER_DISABLED", value = "true" },
        { name = "JVB_ADVERTISE_IPS", value = aws_lb.jitsi_nlb[0].dns_name },
        { name = "TZ", value = "UTC" },
        { name = "COLIBRI_REST_ENABLED", value = "true" },
      ]
      secrets = [
        { name = "JWT_APP_SECRET", valueFrom = local.jitsi_jwt_secret_arn }
      ]
    }
  ])

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# ECS Services
# -----------------------------------------------------------------------------

resource "aws_ecs_service" "jitsi_signal" {
  count = local.jitsi_enabled ? 1 : 0

  name            = "${local.name_prefix}-jitsi-signal"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.jitsi_signal[0].arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.jitsi_signal[0].id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.jitsi_signal[0].arn
    container_name   = "jitsi-signal"
    container_port   = 8443
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  health_check_grace_period_seconds = 120

  service_registries {
    registry_arn = aws_service_discovery_service.jitsi_signal[0].arn
  }

  depends_on = [
    aws_lb_listener_rule.jitsi_signal,
  ]

  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = local.common_tags
}

resource "aws_ecs_service" "jitsi_jvb" {
  count = local.jitsi_enabled ? 1 : 0

  name            = "${local.name_prefix}-jitsi-jvb"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.jitsi_jvb[0].arn
  desired_count   = var.jitsi_jvb_min_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.jitsi_jvb[0].id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.jitsi_jvb[0].arn
    container_name   = "jitsi-jvb"
    container_port   = 10000
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  health_check_grace_period_seconds = 60

  depends_on = [
    aws_lb_listener.jitsi_jvb_udp,
  ]

  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# Service Discovery (so JVB can resolve the signal service by DNS inside VPC)
# -----------------------------------------------------------------------------

resource "aws_service_discovery_private_dns_namespace" "jitsi" {
  count = local.jitsi_enabled ? 1 : 0

  name = "jitsi.${local.name_prefix}.local"
  vpc  = module.vpc.vpc_id

  tags = local.common_tags
}

resource "aws_service_discovery_service" "jitsi_signal" {
  count = local.jitsi_enabled ? 1 : 0

  name = "signal"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.jitsi[0].id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# Auto Scaling (JVB - CPU target tracking at 60%)
# -----------------------------------------------------------------------------

resource "aws_appautoscaling_target" "jitsi_jvb" {
  count = local.jitsi_enabled ? 1 : 0

  max_capacity       = var.jitsi_jvb_max_count
  min_capacity       = var.jitsi_jvb_min_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.jitsi_jvb[0].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "jitsi_jvb_cpu" {
  count = local.jitsi_enabled ? 1 : 0

  name               = "${local.name_prefix}-jitsi-jvb-cpu-tt"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.jitsi_jvb[0].resource_id
  scalable_dimension = aws_appautoscaling_target.jitsi_jvb[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.jitsi_jvb[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# -----------------------------------------------------------------------------
# Route 53 Records
# -----------------------------------------------------------------------------

resource "aws_route53_record" "jitsi_signal_alias" {
  count = local.jitsi_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.public[0].zone_id
  name    = local.jitsi_route53_record_name
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "jitsi_signal_alias_aaaa" {
  count = local.jitsi_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.public[0].zone_id
  name    = local.jitsi_route53_record_name
  type    = "AAAA"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "jitsi_media_alias" {
  count = local.jitsi_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.public[0].zone_id
  name    = local.jitsi_media_route53_record_name
  type    = "A"

  alias {
    name                   = aws_lb.jitsi_nlb[0].dns_name
    zone_id                = aws_lb.jitsi_nlb[0].zone_id
    evaluate_target_health = true
  }
}

# -----------------------------------------------------------------------------
# IAM - Grant execution role access to Jitsi JWT secret
# -----------------------------------------------------------------------------

resource "aws_iam_role_policy" "ecs_execution_jitsi_secrets" {
  count = local.jitsi_enabled ? 1 : 0

  name = "${local.name_prefix}-exec-jitsi-secrets"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "JitsiJwtSecretRead"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [local.jitsi_jwt_secret_base_arn]
      }
    ]
  })
}
