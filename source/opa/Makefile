.PHONY: cleanup
cleanup:
	@rm -rf ./build

bundle: cleanup
	@mkdir	./build
	@cp -R ./bundle/* ./build
	@echo "{\"revision\": \"${VERSION}\"}" > ./build/.manifest
	@cd ./build
	tar --exclude='.git' --exclude='.DS_Store' --exclude='bundle' -cvzf ./build/default.tar.gz .
	cd ./build && zip -r ./default.zip ./default.tar.gz

docker_run: bundle
	docker build -t local -f ./Dockerfile.local . && docker run -p 8181:8181 -it local

.PHONY: buildTestImage
buildTestImage: bundle
	@echo 'building opa docker test image';
	@docker build -t opa-bundle-test:latest --iidfile=$@ -f Dockerfile.test . > /dev/null

.PHONY: dockerTest
dockerTest: docker_clean buildTestImage
	docker run opa-bundle-test:latest

.PHONY: docker_clean
docker_clean:
	-docker rmi $(docker images | grep 'opa-bundle-test' | tr -s ' ' | cut -d ' ' -f 3)
