# Public hosted zone must already exist (e.g. adieuu.com). We do not manage apex (marketing site) or MX/TXT here.

data "aws_route53_zone" "public" {
  count = local.public_dns_tls_enabled ? 1 : 0

  name         = local.route53_zone_fqdn
  private_zone = false
}

# ALB TLS: certificate in the same region as the load balancer (api hostname).
resource "aws_acm_certificate" "alb" {
  count = local.public_dns_tls_enabled ? 1 : 0

  domain_name       = var.api_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

# CloudFront TLS: ACM must be in us-east-1 (AWS requirement for viewer certificates).
resource "aws_acm_certificate" "cloudfront" {
  count = local.public_dns_tls_enabled ? 1 : 0

  provider = aws.us_east_1

  domain_name       = var.app_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

resource "aws_route53_record" "cert_validation_alb" {
  for_each = local.public_dns_tls_enabled ? {
    for dvo in aws_acm_certificate.alb[0].domain_validation_options : dvo.domain_name => {
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

resource "aws_route53_record" "cert_validation_cloudfront" {
  for_each = local.public_dns_tls_enabled ? {
    for dvo in aws_acm_certificate.cloudfront[0].domain_validation_options : dvo.domain_name => {
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

resource "aws_acm_certificate_validation" "alb" {
  count = local.public_dns_tls_enabled ? 1 : 0

  certificate_arn = aws_acm_certificate.alb[0].arn
  validation_record_fqdns = [
    for r in aws_route53_record.cert_validation_alb : r.fqdn
  ]
}

resource "aws_acm_certificate_validation" "cloudfront" {
  count = local.public_dns_tls_enabled ? 1 : 0

  provider = aws.us_east_1

  certificate_arn = aws_acm_certificate.cloudfront[0].arn
  validation_record_fqdns = [
    for r in aws_route53_record.cert_validation_cloudfront : r.fqdn
  ]
}

resource "aws_route53_record" "api_alias" {
  count = local.public_dns_tls_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.public[0].zone_id
  name    = local.api_route53_record_name
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "app_alias" {
  count = local.public_dns_tls_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.public[0].zone_id
  name    = local.app_route53_record_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.web[0].domain_name
    zone_id                = aws_cloudfront_distribution.web[0].hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [aws_cloudfront_distribution.web]
}
