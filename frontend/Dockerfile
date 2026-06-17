FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ENV VITE_API_TARGET=http://backend:8765

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
