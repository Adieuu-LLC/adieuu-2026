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
# Media Lambdas (S3 -> processor -> DB writer; Rekognition video completion)
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

resource "aws_cloudwatch_metric_alarm" "lambda_media_video_complete_errors" {
  count = local.media_enabled && var.enable_media_content_moderation ? 1 : 0

  alarm_name          = "${local.name_prefix}-lambda-media-video-complete-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "Rekognition video moderation completion Lambda errors"
  alarm_actions       = local.alarm_actions

  dimensions = {
    FunctionName = aws_lambda_function.media_video_moderation_complete[0].function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_media_video_complete_duration_high" {
  count = local.media_enabled && var.enable_media_content_moderation ? 1 : 0

  alarm_name          = "${local.name_prefix}-lambda-media-video-complete-duration-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Average"
  threshold           = 120000
  treat_missing_data  = "notBreaching"
  alarm_description   = "Video moderation completion Lambda average duration > 120s (check Rekognition/GetContentModeration)"
  alarm_actions       = local.alarm_actions

  dimensions = {
    FunctionName = aws_lambda_function.media_video_moderation_complete[0].function_name
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
