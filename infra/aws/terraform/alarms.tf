# Operational alarms → SNS (optional email subscription).

resource "aws_sns_topic" "operational" {
  name = "${local.name_prefix}-operational-alarms"

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-operational-alarms" })
}

data "aws_iam_policy_document" "sns_operational_publish" {
  statement {
    sid    = "AllowCloudWatchPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.operational.arn]
  }
}

resource "aws_sns_topic_policy" "operational" {
  arn    = aws_sns_topic.operational.arn
  policy = data.aws_iam_policy_document.sns_operational_publish.json
}

resource "aws_sns_topic_subscription" "operational_email" {
  count = trimspace(var.alarm_notification_email) != "" ? 1 : 0

  topic_arn = aws_sns_topic.operational.arn
  protocol  = "email"
  endpoint  = var.alarm_notification_email
}

locals {
  alarm_actions = [aws_sns_topic.operational.arn]
}

resource "aws_cloudwatch_metric_alarm" "alb_target_5xx_api" {
  alarm_name          = "${local.name_prefix}-alb-target-5xx-api"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_description   = "ALB returned 5xx from API target group"
  alarm_actions       = local.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_target_5xx_chat" {
  alarm_name          = "${local.name_prefix}-alb-target-5xx-chat"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_description   = "ALB returned 5xx from chat target group"
  alarm_actions       = local.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.chat.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "tg_unhealthy_api" {
  alarm_name          = "${local.name_prefix}-tg-unhealthy-api"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "API target group has unhealthy hosts"
  alarm_actions       = local.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "tg_unhealthy_chat" {
  alarm_name          = "${local.name_prefix}-tg-unhealthy-chat"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "Chat target group has unhealthy hosts"
  alarm_actions       = local.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.chat.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_api_cpu_high" {
  alarm_name          = "${local.name_prefix}-ecs-api-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_description   = "API ECS service average CPU above 85%"
  alarm_actions       = local.alarm_actions

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.api.name
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_chat_cpu_high" {
  alarm_name          = "${local.name_prefix}-ecs-chat-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_description   = "Chat ECS service average CPU above 85%"
  alarm_actions       = local.alarm_actions

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.chat.name
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_api_memory_high" {
  alarm_name          = "${local.name_prefix}-ecs-api-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 90
  treat_missing_data  = "notBreaching"
  alarm_description   = "API ECS service average memory above 90%"
  alarm_actions       = local.alarm_actions

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.api.name
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_chat_memory_high" {
  alarm_name          = "${local.name_prefix}-ecs-chat-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 90
  treat_missing_data  = "notBreaching"
  alarm_description   = "Chat ECS service average memory above 90%"
  alarm_actions       = local.alarm_actions

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.chat.name
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_cpu_high" {
  count = var.create_elasticache_redis ? 1 : 0

  alarm_name          = "${local.name_prefix}-redis-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"
  alarm_description   = "ElastiCache primary node CPU above 80%"
  alarm_actions       = local.alarm_actions

  dimensions = {
    CacheClusterId = element(sort(tolist(aws_elasticache_replication_group.redis[0].member_clusters)), 0)
  }
}

# ---------------------------------------------------------------------------
# Media Lambdas (S3 -> processor -> DB writer)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "lambda_media_processor_errors" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-lambda-media-processor-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "Media processor Lambda reported errors"
  alarm_actions       = local.alarm_actions

  dimensions = {
    FunctionName = aws_lambda_function.media_processor[0].function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_media_processor_throttles" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-lambda-media-processor-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "Media processor Lambda is being throttled"
  alarm_actions       = local.alarm_actions

  dimensions = {
    FunctionName = aws_lambda_function.media_processor[0].function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_media_db_writer_errors" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-lambda-media-db-writer-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "Media DB writer Lambda reported errors"
  alarm_actions       = local.alarm_actions

  dimensions = {
    FunctionName = aws_lambda_function.media_db_writer[0].function_name
  }
}

# ---------------------------------------------------------------------------
# CSAM infrastructure alarms
# ---------------------------------------------------------------------------

# DynamoDB NCMEC hash table: read throttles
resource "aws_cloudwatch_metric_alarm" "ncmec_hashes_read_throttle" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-ncmec-hashes-read-throttle"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ReadThrottleEvents"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "NCMEC hash table is throttling reads — check DynamoDB on-demand scaling"
  alarm_actions       = local.alarm_actions

  dimensions = {
    TableName = aws_dynamodb_table.ncmec_hashes[0].name
  }
}

# DynamoDB NCMEC hash table: system errors (internal DynamoDB failures)
resource "aws_cloudwatch_metric_alarm" "ncmec_hashes_system_errors" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-ncmec-hashes-system-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "SystemErrors"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "NCMEC hash table DynamoDB system errors (AWS-side failure)"
  alarm_actions       = local.alarm_actions

  dimensions = {
    TableName = aws_dynamodb_table.ncmec_hashes[0].name
  }
}

# Evidence bucket: 4xx errors (AccessDenied, NoSuchBucket, etc.)
resource "aws_cloudwatch_metric_alarm" "csam_evidence_4xx_errors" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-csam-evidence-4xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "4xxErrors"
  namespace           = "AWS/S3"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "CSAM evidence bucket returning 4xx errors (check IAM, bucket policy)"
  alarm_actions       = local.alarm_actions

  dimensions = {
    BucketName = aws_s3_bucket.csam_evidence[0].id
    FilterId   = "AllMetrics"
  }
}

# Evidence bucket: 5xx errors (S3-side failures)
resource "aws_cloudwatch_metric_alarm" "csam_evidence_5xx_errors" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-csam-evidence-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "5xxErrors"
  namespace           = "AWS/S3"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "CSAM evidence bucket returning 5xx errors (AWS S3-side failure)"
  alarm_actions       = local.alarm_actions

  dimensions = {
    BucketName = aws_s3_bucket.csam_evidence[0].id
    FilterId   = "AllMetrics"
  }
}

# S3 request metrics must be enabled for the evidence bucket
resource "aws_s3_bucket_metric" "csam_evidence" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.csam_evidence[0].id
  name   = "AllMetrics"
}

# ---------------------------------------------------------------------------
# CSAM log-based metric filters + alarms (media-processor structured logs)
#
# The media-processor emits JSON logs with an "event" field. Metric filters
# turn specific events into CloudWatch custom metrics we can alarm on.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "media_processor" {
  count = local.media_enabled ? 1 : 0

  name              = "/aws/lambda/${aws_lambda_function.media_processor[0].function_name}"
  retention_in_days = 30

  tags = local.common_tags
}

# --- CSAM hash match detected (informational: counts detections) ---

resource "aws_cloudwatch_log_metric_filter" "csam_hash_match_detected" {
  count = local.media_enabled ? 1 : 0

  name           = "${local.name_prefix}-csam-hash-match-detected"
  pattern        = "{ $.event = \"csam_hash_match_detected\" }"
  log_group_name = aws_cloudwatch_log_group.media_processor[0].name

  metric_transformation {
    name          = "CsamHashMatchDetected"
    namespace     = "${local.name_prefix}/MediaProcessor"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "csam_hash_match_detected" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-csam-hash-match-detected"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CsamHashMatchDetected"
  namespace           = "${local.name_prefix}/MediaProcessor"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "CSAM hash match detected — evidence archived, identity ban triggered"
  alarm_actions       = local.alarm_actions
}

# --- Arachnid Shield API errors ---

resource "aws_cloudwatch_log_metric_filter" "arachnid_hash_check_error" {
  count = local.media_enabled ? 1 : 0

  name           = "${local.name_prefix}-arachnid-hash-check-error"
  pattern        = "{ $.event = \"arachnid_hash_check_error\" }"
  log_group_name = aws_cloudwatch_log_group.media_processor[0].name

  metric_transformation {
    name          = "ArachnidHashCheckError"
    namespace     = "${local.name_prefix}/MediaProcessor"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "arachnid_hash_check_error" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-arachnid-hash-check-error"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ArachnidHashCheckError"
  namespace           = "${local.name_prefix}/MediaProcessor"
  period              = 300
  statistic           = "Sum"
  threshold           = 3
  treat_missing_data  = "notBreaching"
  alarm_description   = "Arachnid Shield API errors exceeded threshold — check credentials, network, or API status"
  alarm_actions       = local.alarm_actions
}

# --- NCMEC hash check errors ---

resource "aws_cloudwatch_log_metric_filter" "ncmec_hash_check_error" {
  count = local.media_enabled ? 1 : 0

  name           = "${local.name_prefix}-ncmec-hash-check-error"
  pattern        = "{ $.event = \"ncmec_hash_check_error\" }"
  log_group_name = aws_cloudwatch_log_group.media_processor[0].name

  metric_transformation {
    name          = "NcmecHashCheckError"
    namespace     = "${local.name_prefix}/MediaProcessor"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "ncmec_hash_check_error" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-ncmec-hash-check-error"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "NcmecHashCheckError"
  namespace           = "${local.name_prefix}/MediaProcessor"
  period              = 300
  statistic           = "Sum"
  threshold           = 3
  treat_missing_data  = "notBreaching"
  alarm_description   = "NCMEC DynamoDB hash check errors exceeded threshold — check table health"
  alarm_actions       = local.alarm_actions
}

# --- Evidence archival failures ---

resource "aws_cloudwatch_log_metric_filter" "csam_evidence_archive_error" {
  count = local.media_enabled ? 1 : 0

  name           = "${local.name_prefix}-csam-evidence-archive-error"
  pattern        = "{ $.event = \"csam_evidence_archive_error\" }"
  log_group_name = aws_cloudwatch_log_group.media_processor[0].name

  metric_transformation {
    name          = "CsamEvidenceArchiveError"
    namespace     = "${local.name_prefix}/MediaProcessor"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "csam_evidence_archive_error" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-csam-evidence-archive-error"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CsamEvidenceArchiveError"
  namespace           = "${local.name_prefix}/MediaProcessor"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "CRITICAL: Failed to archive CSAM evidence to isolated bucket — evidence may be lost"
  alarm_actions       = local.alarm_actions
}

# --- Fatal hash check errors (entire check pipeline failed) ---

resource "aws_cloudwatch_log_metric_filter" "csam_hash_check_fatal" {
  count = local.media_enabled ? 1 : 0

  name           = "${local.name_prefix}-csam-hash-check-fatal"
  pattern        = "{ $.event = \"csam_hash_check_fatal\" }"
  log_group_name = aws_cloudwatch_log_group.media_processor[0].name

  metric_transformation {
    name          = "CsamHashCheckFatal"
    namespace     = "${local.name_prefix}/MediaProcessor"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "csam_hash_check_fatal" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-csam-hash-check-fatal"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CsamHashCheckFatal"
  namespace           = "${local.name_prefix}/MediaProcessor"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "CSAM hash check pipeline fatal error — media marked as failed, no hash check was performed"
  alarm_actions       = local.alarm_actions
}

# ---------------------------------------------------------------------------
# DB writer CSAM log-based alarms
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "media_db_writer" {
  count = local.media_enabled ? 1 : 0

  name              = "/aws/lambda/${aws_lambda_function.media_db_writer[0].function_name}"
  retention_in_days = 30

  tags = local.common_tags
}

# --- CSAM report creation errors ---

resource "aws_cloudwatch_log_metric_filter" "csam_report_error" {
  count = local.media_enabled ? 1 : 0

  name           = "${local.name_prefix}-csam-report-error"
  pattern        = "{ $.event = \"csam_report_error\" }"
  log_group_name = aws_cloudwatch_log_group.media_db_writer[0].name

  metric_transformation {
    name          = "CsamReportError"
    namespace     = "${local.name_prefix}/MediaDbWriter"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "csam_report_error" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-csam-report-error"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CsamReportError"
  namespace           = "${local.name_prefix}/MediaDbWriter"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "CRITICAL: Failed to create CSAM report in MongoDB — match detected but report not created"
  alarm_actions       = local.alarm_actions
}

# --- Identity ban failures ---

resource "aws_cloudwatch_log_metric_filter" "csam_identity_ban_error" {
  count = local.media_enabled ? 1 : 0

  name           = "${local.name_prefix}-csam-identity-ban-error"
  pattern        = "{ $.event = \"csam_identity_ban_error\" }"
  log_group_name = aws_cloudwatch_log_group.media_db_writer[0].name

  metric_transformation {
    name          = "CsamIdentityBanError"
    namespace     = "${local.name_prefix}/MediaDbWriter"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "csam_identity_ban_error" {
  count = local.media_enabled ? 1 : 0

  alarm_name          = "${local.name_prefix}-csam-identity-ban-error"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CsamIdentityBanError"
  namespace           = "${local.name_prefix}/MediaDbWriter"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "CRITICAL: Failed to ban identity after CSAM match — manual intervention required"
  alarm_actions       = local.alarm_actions
}
