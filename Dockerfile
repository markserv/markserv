# Serve markdown in a contianer
# https://github.com/markserv/markserv
#
# sudo docker build -t your_username/markserv .
# sudo docker run --rm -d -p 8642:8642 -v /path_to_your_awesome_markdown_project/:/markserv -v /etc/localtime:/etc/localtime:ro --name markserv your_username/markserv
#
# Todo: Improve security, serving with user inside the container instead of serving as root.
FROM node:latest
LABEL maintainer "Hudson Santos <hudsantos@gmail.com>"

RUN npm i -g markserv

ENTRYPOINT [ "markserv", "-p", "8642", "-a", "0.0.0.0", "/markserv" ]