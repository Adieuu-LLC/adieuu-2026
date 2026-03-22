resource "aws_lb" "main" {
  name               = local.alb_name
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets

  idle_timeout = var.alb_idle_timeout_seconds

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-alb" })
}

resource "aws_lb_target_group" "api" {
  name        = local.tg_api_name
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/api/health/live"
    matcher             = "200"
    protocol            = "HTTP"
    port                = "traffic-port"
  }

  deregistration_delay = 30

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-api-tg" })
}

resource "aws_lb_target_group" "chat" {
  name        = local.tg_chat_name
  port        = 9001
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/ready"
    matcher             = "200"
    protocol            = "HTTP"
    port                = "traffic-port"
  }

  deregistration_delay = 300

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-chat-tg" })
}

# Split so each listener has exactly one default_action shape (redirect OR fixed-response).
# Using dynamic blocks for both triggered an invalid combination warning with the AWS provider.

resource "aws_lb_listener" "http_redirect" {
  count = local.public_dns_tls_enabled ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "http_only" {
  count = local.public_dns_tls_enabled ? 0 : 1

  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener" "https" {
  count = local.public_dns_tls_enabled ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.alb[0].certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }

  depends_on = [aws_acm_certificate_validation.alb]
}

# Placeholder until CloudFront/S3 or an ECS service backs the web app.
resource "aws_lb_listener_rule" "app_placeholder" {
  count = local.public_dns_tls_enabled ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 5

  action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Web app is not deployed yet."
      status_code  = "503"
    }
  }

  condition {
    host_header {
      values = [var.app_domain_name]
    }
  }
}

resource "aws_lb_listener_rule" "chat_ws" {
  listener_arn = local.public_dns_tls_enabled ? aws_lb_listener.https[0].arn : aws_lb_listener.http_only[0].arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.chat.arn
  }

  dynamic "condition" {
    for_each = local.public_dns_tls_enabled ? [1] : []
    content {
      host_header {
        values = [var.api_domain_name]
      }
    }
  }

  condition {
    path_pattern {
      values = ["/ws/*"]
    }
  }
}

resource "aws_lb_listener_rule" "chat_http" {
  listener_arn = local.public_dns_tls_enabled ? aws_lb_listener.https[0].arn : aws_lb_listener.http_only[0].arn
  priority     = 11

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.chat.arn
  }

  dynamic "condition" {
    for_each = local.public_dns_tls_enabled ? [1] : []
    content {
      host_header {
        values = [var.api_domain_name]
      }
    }
  }

  condition {
    path_pattern {
      values = ["/ready", "/health"]
    }
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = local.public_dns_tls_enabled ? aws_lb_listener.https[0].arn : aws_lb_listener.http_only[0].arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  dynamic "condition" {
    for_each = local.public_dns_tls_enabled ? [1] : []
    content {
      host_header {
        values = [var.api_domain_name]
      }
    }
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}
