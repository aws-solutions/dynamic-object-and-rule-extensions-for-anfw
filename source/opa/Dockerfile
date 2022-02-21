FROM openpolicyagent/opa

COPY config.yaml .

EXPOSE 8080

CMD ["run", "-s","-c", "config.yaml", "-a", ":8080", "-l","debug"]