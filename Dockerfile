# NCE Flow Docker Image
# 使用轻量级的 Nginx Alpine 镜像
FROM nginx:alpine

# 设置维护者信息和标签
LABEL maintainer="luzhenhua <luzhenhuadev@qq.com>"
LABEL description="NCE Flow - 新概念英语学习应用"
LABEL org.opencontainers.image.source="https://github.com/luzhenhua/NCE-Flow"
LABEL org.opencontainers.image.description="新概念英语在线点读，点句即读、连续播放"
LABEL org.opencontainers.image.licenses="MIT"

# 复制自定义 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 复制所有项目文件到 Nginx 默认的静态文件目录
COPY assets /usr/share/nginx/html/assets
COPY static /usr/share/nginx/html/static
COPY images /usr/share/nginx/html/images
COPY NCE1 /usr/share/nginx/html/NCE1
COPY NCE2 /usr/share/nginx/html/NCE2
COPY NCE3 /usr/share/nginx/html/NCE3
COPY NCE4 /usr/share/nginx/html/NCE4
COPY *.html /usr/share/nginx/html/
COPY favicon.ico /usr/share/nginx/html/

# 设置正确的权限
RUN chmod -R 755 /usr/share/nginx/html

# 暴露 80 端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
