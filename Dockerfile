FROM node:20-bullseye

RUN apt-get update && apt-get install -y \
    lsb-release \
    ca-certificates \
    apt-transport-https \
    software-properties-common \
    curl \
    unzip \
    && curl -sSL https://packages.sury.org/php/README.txt | bash -x \
    && apt-get update && apt-get install -y \
    php8.1-cli \
    php8.1-mbstring \
    php8.1-xml \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sS https://getcomposer.org/installer | php -- \
    --install-dir=/usr/local/bin --filename=composer

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY composer.json ./
RUN composer install --no-interaction --prefer-dist

COPY . .

RUN mkdir -p uploads

EXPOSE 3000

CMD ["node", "server.js"]