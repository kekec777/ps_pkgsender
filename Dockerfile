FROM node:20-alpine

WORKDIR /pkg_sender

RUN apk --no-cache add curl unzip

COPY package.json package.json
RUN npm install

COPY src src

CMD ["npm", "start"]
