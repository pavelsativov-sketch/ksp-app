FROM node:20-alpine
WORKDIR /usr/src/app
COPY package.json ./
RUN npm ci --production
COPY server.js ./
EXPOSE 4000
CMD ["node", "server.js"]
