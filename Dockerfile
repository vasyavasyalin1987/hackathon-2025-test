FROM node:17
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]