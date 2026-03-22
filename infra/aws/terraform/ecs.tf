resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = var.enable_container_insights ? "enabled" : "disabled"
  }

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name_prefix}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.api_task_cpu
  memory                   = var.api_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    merge(
      {
        name      = "api"
        image     = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"
        essential = true
        portMappings = [
          {
            containerPort = 4000
            protocol      = "tcp"
          }
        ]
        logConfiguration = {
          logDriver = "awslogs"
          options = {
            "awslogs-group"         = aws_cloudwatch_log_group.api.name
            "awslogs-region"        = var.aws_region
            "awslogs-stream-prefix" = "api"
          }
        }
        environment = concat(
          [
            { name = "PORT", value = "4000" },
            { name = "HOST", value = "0.0.0.0" },
            { name = "NODE_ENV", value = var.node_env }
          ],
          [for k in sort(keys(local.api_env_for_task)) : { name = k, value = local.api_env_for_task[k] }]
        )
      },
      length(var.api_container_secrets) > 0 ? {
        secrets = [for k, v in var.api_container_secrets : { name = k, valueFrom = v }]
      } : {}
    )
  ])

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "chat" {
  family                   = "${local.name_prefix}-chat"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.chat_task_cpu
  memory                   = var.chat_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    merge(
      {
        name      = "chat"
        image     = "${aws_ecr_repository.chat.repository_url}:${var.chat_image_tag}"
        essential = true
        portMappings = [
          {
            containerPort = 9001
            protocol      = "tcp"
          }
        ]
        logConfiguration = {
          logDriver = "awslogs"
          options = {
            "awslogs-group"         = aws_cloudwatch_log_group.chat.name
            "awslogs-region"        = var.aws_region
            "awslogs-stream-prefix" = "chat"
          }
        }
        environment = concat(
          [
            { name = "CHAT_PORT", value = "9001" },
            { name = "CHAT_HOST", value = "0.0.0.0" },
            { name = "NODE_ENV", value = var.node_env }
          ],
          [for k in sort(keys(local.chat_env_for_task)) : { name = k, value = local.chat_env_for_task[k] }]
        )
      },
      length(var.chat_container_secrets) > 0 ? {
        secrets = [for k, v in var.chat_container_secrets : { name = k, valueFrom = v }]
      } : {}
    )
  ])

  tags = local.common_tags
}

resource "aws_ecs_service" "api" {
  name            = "${local.name_prefix}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  health_check_grace_period_seconds = 60

  depends_on = [
    aws_lb_listener.http_redirect,
    aws_lb_listener.http_only,
  ]

  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = local.common_tags
}

resource "aws_ecs_service" "chat" {
  name            = "${local.name_prefix}-chat"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.chat.arn
  desired_count   = var.chat_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.chat.arn
    container_name   = "chat"
    container_port   = 9001
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  health_check_grace_period_seconds = 120

  depends_on = [
    aws_lb_listener.http_redirect,
    aws_lb_listener.http_only,
  ]

  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = local.common_tags
}
