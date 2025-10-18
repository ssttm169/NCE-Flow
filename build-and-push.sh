#!/bin/bash

# NCE Flow Docker 镜像构建和推送脚本
# 使用方法: ./build-and-push.sh <version>
# 例如: ./build-and-push.sh 1.1.3

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查参数
if [ -z "$1" ]; then
    echo -e "${RED}错误: 请提供版本号${NC}"
    echo "使用方法: $0 <version>"
    echo "例如: $0 1.1.3"
    exit 1
fi

VERSION=$1
DOCKER_USERNAME="luzhenhua"  # 修改为你的 Docker Hub 用户名
IMAGE_NAME="nce-flow"
FULL_IMAGE_NAME="${DOCKER_USERNAME}/${IMAGE_NAME}"

echo -e "${GREEN}开始构建 NCE Flow Docker 镜像...${NC}"
echo "版本: ${VERSION}"
echo "镜像名称: ${FULL_IMAGE_NAME}"
echo ""

# 检查是否已登录 Docker Hub
echo -e "${YELLOW}检查 Docker Hub 登录状态...${NC}"
if ! docker info | grep -q "Username"; then
    echo -e "${YELLOW}请先登录 Docker Hub:${NC}"
    docker login
fi

# 构建镜像
echo -e "${GREEN}步骤 1/3: 构建 Docker 镜像...${NC}"
docker build -t ${FULL_IMAGE_NAME}:${VERSION} \
             -t ${FULL_IMAGE_NAME}:latest \
             --platform linux/amd64,linux/arm64 \
             .

if [ $? -ne 0 ]; then
    echo -e "${RED}构建失败！${NC}"
    exit 1
fi

echo -e "${GREEN}构建成功！${NC}"
echo ""

# 推送镜像
echo -e "${GREEN}步骤 2/3: 推送版本标签 (${VERSION})...${NC}"
docker push ${FULL_IMAGE_NAME}:${VERSION}

echo -e "${GREEN}步骤 3/3: 推送 latest 标签...${NC}"
docker push ${FULL_IMAGE_NAME}:latest

echo ""
echo -e "${GREEN}✓ 镜像发布成功！${NC}"
echo ""
echo "用户现在可以使用以下命令运行:"
echo -e "${YELLOW}docker run -d -p 8080:80 ${FULL_IMAGE_NAME}:${VERSION}${NC}"
echo "或"
echo -e "${YELLOW}docker run -d -p 8080:80 ${FULL_IMAGE_NAME}:latest${NC}"
echo ""
echo "Docker Hub 链接: https://hub.docker.com/r/${FULL_IMAGE_NAME}"
