FROM frapsoft/openssl:latest AS ssl


# Generate a self-signed certificate https://gist.github.com/thbkrkr/aa16435cb6c183e55a33
# We can use whatever certificates because ALB doesn't verify it
WORKDIR /temp

RUN openssl rand -base64 48 > passphrase.txt

RUN openssl genrsa -aes128 -passout file:passphrase.txt -out server.key 2048

RUN openssl req -new -passin file:passphrase.txt -key server.key -out server.csr \
    -subj "/C=US/O=aws/OU=Domain Control Validated/CN=*.example.com"

RUN cp server.key server.key.org
RUN openssl rsa -in server.key.org -passin file:passphrase.txt -out server.key

RUN openssl x509 -req -days 36500 -in server.csr -signkey server.key -out server.crt


FROM public.ecr.aws/nginx/nginx:mainline-alpine

# Required ARGS
ARG UPSTREAM_PORT=9000
ARG PORT=443

COPY --from=ssl /temp/server.key /etc/nginx/cert.key
COPY --from=ssl /temp/server.crt /etc/nginx/cert.crt
ADD default.conf.tmpl /etc/nginx/conf.d/default.conf.tmpl

RUN set -eux; \
    envsubst '$PORT,$UPSTREAM_PORT' < /etc/nginx/conf.d/default.conf.tmpl > /etc/nginx/conf.d/default.conf