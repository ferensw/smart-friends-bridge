ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine

ENV LANG C.UTF-8

WORKDIR /opt

# Copy root filesystem
COPY rootfs /
RUN chmod a+x /run.sh

# Install Git
RUN apk add --no-cache git

# Install NodeJS modules
RUN npm install https://github.com/ferensw/smart-friends-bridge#1.2.1 -g

EXPOSE 8080

CMD [ "/run.sh" ]
