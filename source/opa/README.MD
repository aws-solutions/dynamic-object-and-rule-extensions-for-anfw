# local build
```
make bundle
```
# notice
default.tar.gz is a test bundle which will be removed later on, without it it would very hard to prove the feature e.g decision_logs and api endpoints work correctly


# build
make bundle

# run  local
make docker_run
or 
opa run -b build/default.tar.gz -s

note please make sure your opa is in version 0.26.0