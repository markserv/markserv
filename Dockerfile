FROM node:stretch-slim

WORKDIR /usr/app

COPY ./lib /usr/app/lib
COPY ./media /usr/app/media
COPY ./package.json /usr/app/package.json

RUN cd /usr/app
RUN npm install

RUN echo "fs.inotify.max_user_watches=524288" >> /etc/sysctl.conf

CMD ["/usr/app/lib/cli.js", "-a", "0.0.0.0", "-p", "8080", "./files"]
