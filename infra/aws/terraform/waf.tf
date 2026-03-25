# REGIONAL ACL for ALB; CLOUDFRONT ACL (us-east-1) for the web distribution.

resource "aws_wafv2_ip_set" "public_allowlist_regional_v4" {
  count = local.public_dns_tls_enabled && var.enable_waf && local.public_ingress_restricted && length(local.public_allowed_cidr_blocks_v4) > 0 ? 1 : 0

  name               = "${local.name_prefix}-public-allowlist-v4"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = local.public_allowed_cidr_blocks_v4

  tags = local.common_tags
}

resource "aws_wafv2_ip_set" "public_allowlist_regional_v6" {
  count = local.public_dns_tls_enabled && var.enable_waf && local.public_ingress_restricted && length(local.public_allowed_cidr_blocks_v6) > 0 ? 1 : 0

  name               = "${local.name_prefix}-public-allowlist-v6"
  scope              = "REGIONAL"
  ip_address_version = "IPV6"
  addresses          = local.public_allowed_cidr_blocks_v6

  tags = local.common_tags
}

resource "aws_wafv2_ip_set" "public_allowlist_cdn_v4" {
  count = local.cdn_waf_from_terraform && local.public_ingress_restricted && length(local.public_allowed_cidr_blocks_v4) > 0 ? 1 : 0

  provider = aws.us_east_1

  name               = "${local.name_prefix}-cdn-public-allowlist-v4"
  scope              = "CLOUDFRONT"
  ip_address_version = "IPV4"
  addresses          = local.public_allowed_cidr_blocks_v4

  tags = local.common_tags
}

resource "aws_wafv2_ip_set" "public_allowlist_cdn_v6" {
  count = local.cdn_waf_from_terraform && local.public_ingress_restricted && length(local.public_allowed_cidr_blocks_v6) > 0 ? 1 : 0

  provider = aws.us_east_1

  name               = "${local.name_prefix}-cdn-public-allowlist-v6"
  scope              = "CLOUDFRONT"
  ip_address_version = "IPV6"
  addresses          = local.public_allowed_cidr_blocks_v6

  tags = local.common_tags
}

resource "aws_wafv2_web_acl" "alb" {
  count = local.public_dns_tls_enabled && var.enable_waf ? 1 : 0

  name  = "${local.name_prefix}-alb-waf"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = local.public_dns_tls_enabled && var.enable_waf && local.public_ingress_restricted ? [1] : []
    content {
      name     = "block-not-in-public-allowlist"
      priority = 5

      action {
        block {}
      }

      statement {
        not_statement {
          statement {
            dynamic "or_statement" {
              for_each = length(local.public_allowed_cidr_blocks_v4) > 0 && length(local.public_allowed_cidr_blocks_v6) > 0 ? [1] : []
              content {
                dynamic "statement" {
                  for_each = {
                    v4 = aws_wafv2_ip_set.public_allowlist_regional_v4[0].arn
                    v6 = aws_wafv2_ip_set.public_allowlist_regional_v6[0].arn
                  }
                  content {
                    ip_set_reference_statement {
                      arn = statement.value
                    }
                  }
                }
              }
            }

            dynamic "ip_set_reference_statement" {
              for_each = length(local.public_allowed_cidr_blocks_v4) > 0 && length(local.public_allowed_cidr_blocks_v6) == 0 ? [1] : []
              content {
                arn = aws_wafv2_ip_set.public_allowlist_regional_v4[0].arn
              }
            }

            dynamic "ip_set_reference_statement" {
              for_each = length(local.public_allowed_cidr_blocks_v4) == 0 && length(local.public_allowed_cidr_blocks_v6) > 0 ? [1] : []
              content {
                arn = aws_wafv2_ip_set.public_allowlist_regional_v6[0].arn
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name_prefix}-alb-allowlist"
        sampled_requests_enabled   = true
      }
    }
  }

  # Block bodies larger than api_max_request_body_bytes (matches ECS MAX_REQUEST_BODY_BYTES + Bun router).
  # SizeRestrictions_BODY in CommonRuleSet uses a ~8 KiB cap; we count that rule and enforce our limit here instead.
  rule {
    name     = "block-request-body-over-max"
    priority = 8

    action {
      block {}
    }

    statement {
      size_constraint_statement {
        comparison_operator = "GT"
        size                = var.api_max_request_body_bytes
        field_to_match {
          body {
            oversize_handling = "CONTINUE"
          }
        }
        text_transformation {
          priority = 0
          type     = "NONE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-alb-body-over-max"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"

        # E2E crypto payloads (e.g. POST /api/identity/:id/e2e/initialize) exceed the
        # managed rule ~8 KiB body limit; we enforce api_max_request_body_bytes via block-request-body-over-max instead.
        rule_action_override {
          action_to_use {
            count {}
          }
          name = "SizeRestrictions_BODY"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-alb-common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 20

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-alb-badinputs"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-alb-waf"
    sampled_requests_enabled   = true
  }

  tags = local.common_tags
}

resource "aws_wafv2_web_acl_association" "alb" {
  count = local.public_dns_tls_enabled && var.enable_waf ? 1 : 0

  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.alb[0].arn
}

resource "aws_wafv2_web_acl" "cdn" {
  count = local.cdn_waf_from_terraform ? 1 : 0

  provider = aws.us_east_1

  name  = "${local.name_prefix}-cdn-waf"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = local.cdn_waf_from_terraform && local.public_ingress_restricted ? [1] : []
    content {
      name     = "block-not-in-public-allowlist"
      priority = 5

      action {
        block {}
      }

      statement {
        not_statement {
          statement {
            dynamic "or_statement" {
              for_each = length(local.public_allowed_cidr_blocks_v4) > 0 && length(local.public_allowed_cidr_blocks_v6) > 0 ? [1] : []
              content {
                dynamic "statement" {
                  for_each = {
                    v4 = aws_wafv2_ip_set.public_allowlist_cdn_v4[0].arn
                    v6 = aws_wafv2_ip_set.public_allowlist_cdn_v6[0].arn
                  }
                  content {
                    ip_set_reference_statement {
                      arn = statement.value
                    }
                  }
                }
              }
            }

            dynamic "ip_set_reference_statement" {
              for_each = length(local.public_allowed_cidr_blocks_v4) > 0 && length(local.public_allowed_cidr_blocks_v6) == 0 ? [1] : []
              content {
                arn = aws_wafv2_ip_set.public_allowlist_cdn_v4[0].arn
              }
            }

            dynamic "ip_set_reference_statement" {
              for_each = length(local.public_allowed_cidr_blocks_v4) == 0 && length(local.public_allowed_cidr_blocks_v6) > 0 ? [1] : []
              content {
                arn = aws_wafv2_ip_set.public_allowlist_cdn_v6[0].arn
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name_prefix}-cdn-allowlist"
        sampled_requests_enabled   = true
      }
    }
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-cdn-common"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-cdn-waf"
    sampled_requests_enabled   = true
  }

  tags = local.common_tags
}
