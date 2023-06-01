FROM public.ecr.aws/q0y2g4u1/openpolicyagent/opa:0.39.0-rootless

COPY config.yaml .

EXPOSE 8080

CMD ["run", "-s","-c", "config.yaml", "-a", ":8080", "-l","debug"]