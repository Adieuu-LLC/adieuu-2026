data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${local.name_prefix}-ecs-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name               = "${local.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

# ECS agent uses the execution role to inject Secrets Manager values into the task (not the task role).
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  count = length(local.secretsmanager_resource_arns) > 0 || length(var.secretsmanager_kms_key_arns) > 0 ? 1 : 0

  name = "${local.name_prefix}-exec-secrets"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      length(local.secretsmanager_resource_arns) > 0 ? [{
        Sid      = "SecretsManagerGet"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = local.secretsmanager_resource_arns
      }] : [],
      length(var.secretsmanager_kms_key_arns) > 0 ? [{
        Sid      = "KMSDecrypt"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = var.secretsmanager_kms_key_arns
      }] : []
    )
  })
}

# ECS task role: read release manifests from the private S3 bucket (downloads stack).
resource "aws_iam_role_policy" "ecs_task_release_manifests" {
  count = local.downloads_enabled ? 1 : 0

  name = "${local.name_prefix}-task-release-manifests"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadReleaseManifests"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = ["${aws_s3_bucket.release_manifests[0].arn}/*"]
      }
    ]
  })
}
