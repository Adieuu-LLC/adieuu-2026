# Optional ElastiCache for Redis (same VPC private subnets as ECS). Opt-in via create_elasticache_redis.

resource "aws_security_group" "redis" {
  count = var.create_elasticache_redis ? 1 : 0

  name        = "${local.name_prefix}-redis-sg"
  description = "Redis for ${local.name_prefix}"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "Redis from ECS tasks"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-redis" })
}

resource "aws_elasticache_subnet_group" "redis" {
  count = var.create_elasticache_redis ? 1 : 0

  name       = "${local.name_prefix}-redis-snet"
  subnet_ids = module.vpc.private_subnets

  tags = local.common_tags
}

resource "aws_elasticache_replication_group" "redis" {
  count = var.create_elasticache_redis ? 1 : 0

  replication_group_id = substr(replace("${var.project_name}-${var.environment}-redis", "_", "-"), 0, 40)
  description          = "Redis for ${local.name_prefix}"

  engine         = "redis"
  engine_version = var.redis_engine_version
  node_type      = var.redis_node_type
  port           = 6379

  num_cache_clusters         = 1
  automatic_failover_enabled = false
  multi_az_enabled           = false
  transit_encryption_enabled = false
  at_rest_encryption_enabled = true

  subnet_group_name  = aws_elasticache_subnet_group.redis[0].name
  security_group_ids = [aws_security_group.redis[0].id]

  snapshot_retention_limit = var.redis_snapshot_retention_days

  tags = local.common_tags
}
