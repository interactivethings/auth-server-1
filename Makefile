.PHONY: all install

all: server

install: node_modules

server: install
	NODE_ENV=development npm start

lint:
	@$$(npm bin)/eslint .

node_modules: package.json
	@npm install
	@touch $@
