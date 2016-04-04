.PHONY: all install

all: server

install: node_modules

server: install
	npm start

node_modules: package.json
	@npm install
	@touch $@
