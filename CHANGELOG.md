# Changelog

## [1.1.0](https://github.com/tim-zitcha/gh-watcher/compare/v1.0.0...v1.1.0) (2026-04-27)


### Features

* browser shortcut, draft toggle, view scroll persistence, TTL cache, mark-seen fingerprint fix ([99e1ae8](https://github.com/tim-zitcha/gh-watcher/commit/99e1ae87a04ed320995c13c5c1e6dcbcc6437fe3))

## 1.0.0 (2026-04-27)


### Features

* add diff state fields, reducer cases, and Dashboard wiring ([03f50dc](https://github.com/tim-zitcha/gh-watcher/commit/03f50dcf3b14b911854793716c6f0db575fffdf5))
* add DiffFile and DiffLine types ([974480a](https://github.com/tim-zitcha/gh-watcher/commit/974480a81652d589877d0f5115bd3e94992948cf))
* add fetchNotifications() via gh api /notifications ([96662e3](https://github.com/tim-zitcha/gh-watcher/commit/96662e3a408317ea657cba8c88dab19d59af7e28))
* add fetchPullRequestDiff via gh pr diff ([8834fa0](https://github.com/tim-zitcha/gh-watcher/commit/8834fa0238382cbffad68f83d06559939a488313))
* add formatting helpers, Header, and Footer components ([f369539](https://github.com/tim-zitcha/gh-watcher/commit/f36953919937a7f9efedb229fd57258b099705af))
* add messages mode to AppMode, ViewKey and AppState ([552d76f](https://github.com/tim-zitcha/gh-watcher/commit/552d76fe974c3d01e8210237e106549d6428843e))
* add MessagesList component for GitHub notifications ([fb6fb4a](https://github.com/tim-zitcha/gh-watcher/commit/fb6fb4a2ab1dfaacfa3f3cd925e772b3f26f2ef1))
* add overlay components (AuthorPicker, ScopePicker, CustomUserInput) ([74ad780](https://github.com/tim-zitcha/gh-watcher/commit/74ad780fe1b426353be385bfcf946a940df5e701))
* add parseDiff helper with tests ([e127a06](https://github.com/tim-zitcha/gh-watcher/commit/e127a0685e0c5fac187e944b6b114970cc4eb5b2))
* add PrDetail component ([fc19c81](https://github.com/tim-zitcha/gh-watcher/commit/fc19c81a08133fa2199331412200460d26c49e24))
* add PrList and SecurityList components ([873b9d8](https://github.com/tim-zitcha/gh-watcher/commit/873b9d8f512f5364ae81cbbbded649303db2ca8f))
* add PullRequestDetail types and fetchPullRequestDetail ([e0ab032](https://github.com/tim-zitcha/gh-watcher/commit/e0ab03274e0c8498d430aed3af604b6f75152b34))
* add scrollbar to PR detail pane ([8af8987](https://github.com/tim-zitcha/gh-watcher/commit/8af89879c70657b764887c17c397956ddf3b0d26))
* add StatusBar, ModeStrip, SubNav header components ([6780535](https://github.com/tim-zitcha/gh-watcher/commit/6780535fad4589db837f34f66353f28c1712338f))
* click on PR row to open detail pane ([341a4f8](https://github.com/tim-zitcha/gh-watcher/commit/341a4f8b7f4ccd8a3c6760b4ec4c7583d8d8550c))
* draw scrollbar inline in detail pane content ([18357af](https://github.com/tim-zitcha/gh-watcher/commit/18357afa71ba66b8f434188bd34d61666682f252))
* fetch Dependabot alerts for all accessible orgs automatically ([71f73c2](https://github.com/tim-zitcha/gh-watcher/commit/71f73c20104c4432a47df65fc5c81f2b92cdc310))
* implement PR detail split pane ([0a4d040](https://github.com/tim-zitcha/gh-watcher/commit/0a4d040ff1555a2bd70df0ff667ba280f00689ec))
* mark notification read/all-read with m/M in messages view ([7fa507a](https://github.com/tim-zitcha/gh-watcher/commit/7fa507a88d93163568b5bec9644eea3243c09553))
* mode-aware Footer with messages and security keybinding hints ([099c523](https://github.com/tim-zitcha/gh-watcher/commit/099c5238e3a35c0d216155fb6a74de20d6d6f564))
* panel focus with active border and left/right PR navigation ([6303878](https://github.com/tim-zitcha/gh-watcher/commit/630387876d27483b2df6196e34610e0add1139aa))
* PR detail split pane ([53ad841](https://github.com/tim-zitcha/gh-watcher/commit/53ad8411199e2625cbd563d08833216a01d724b1))
* redesign PR list rows with unread dot, CI/review glyphs, dim-on-read ([17f2e52](https://github.com/tim-zitcha/gh-watcher/commit/17f2e521f9812c67802b4a8979189c5c3602ab6a))
* render diff section in PR detail panel ([96eb28b](https://github.com/tim-zitcha/gh-watcher/commit/96eb28b89e3111a0d40097068035a19a24f0413b))
* scaffold ink Dashboard shell with state reducer ([c19ad07](https://github.com/tim-zitcha/gh-watcher/commit/c19ad07eba8f036b6992cb30ede325a50d1af41c))
* silently re-fetch open PR detail on each background refresh ([73e397e](https://github.com/tim-zitcha/gh-watcher/commit/73e397e74e08287b8a4d0df626792155bd9ab705))
* strip HTML from PR description before display ([139edcd](https://github.com/tim-zitcha/gh-watcher/commit/139edcdc83bd4e750ea40abb6de38c84df401d52))
* wire messages mode, 1/2/3 nav, notifications refresh into Dashboard ([bac1cee](https://github.com/tim-zitcha/gh-watcher/commit/bac1cee5c6e17c50c42d2f38ca2abb14f5ab1110))
* wire up Dashboard — keyboard, refresh timer, full render tree ([2eee587](https://github.com/tim-zitcha/gh-watcher/commit/2eee587980445a2e102c7928d2172f2855277adf))


### Bug Fixes

* align header with data rows, move row count to bottom ([5223bf7](https://github.com/tim-zitcha/gh-watcher/commit/5223bf7bab1e4db03b42ac9c989bb549bb0205d9))
* clean up detail pane and narrow list display ([cccaf8a](https://github.com/tim-zitcha/gh-watcher/commit/cccaf8ab114b3cfc33fa8fc6f37dc7f30155abaa))
* compact CI symbol prevents ... truncation, rename R header to Rev ([47a9c08](https://github.com/tim-zitcha/gh-watcher/commit/47a9c08ad043c98ec687a17b66447177213b1713))
* compact list layout and click handler ([c0252b1](https://github.com/tim-zitcha/gh-watcher/commit/c0252b14bb9b51efb739b457cb58bef13cc55892))
* correct stale closures in refresh timer and queued refresh ([3a8daed](https://github.com/tim-zitcha/gh-watcher/commit/3a8daed95afe859c4fd687568a2721412134f3c4))
* eliminate scroll artifacts by managing detail scroll manually ([059421b](https://github.com/tim-zitcha/gh-watcher/commit/059421b36b30d4caa5e810064da9f9c46b4f6283))
* enable scrolling in PR detail pane ([6960595](https://github.com/tim-zitcha/gh-watcher/commit/6960595a127b61da85ad243647dc9324eaaff2d6))
* prevent stale detail data race condition and fetch flood ([903e695](https://github.com/tim-zitcha/gh-watcher/commit/903e695913d15e1cbe2553cb3d05a07d1cfe7a70))
* refresh correct view when in security mode ([4c281ec](https://github.com/tim-zitcha/gh-watcher/commit/4c281ec7ddceba86d4b466966dec6f50c297415e))
* remove org: entries from author picker — org scopes are not valid GitHub usernames ([f34baae](https://github.com/tim-zitcha/gh-watcher/commit/f34baae49a981d27c321ffb7443364078f201db8))
* remove stderr write from notification timeout — was corrupting Ink TUI display ([a28b1b3](https://github.com/tim-zitcha/gh-watcher/commit/a28b1b348041343a1fa0be1b189b749e693a0be2))
* resolve lint errors blocking CI ([9672ae5](https://github.com/tim-zitcha/gh-watcher/commit/9672ae5de94b9cdf581fd3180188bb0bf0b35e19))
* security view selection was clamped to PR list length instead of alert count ([7a0e89a](https://github.com/tim-zitcha/gh-watcher/commit/7a0e89a7c8a809c7280534d8aff5353a711c4e6a))
* truncate long diff lines to prevent scrollbar artifacts in detail panel ([8ffd02d](https://github.com/tim-zitcha/gh-watcher/commit/8ffd02da09b580a366175df25efa3a6d404f8101))
* use normalizeRequestedReviewer in fetchPullRequestDetail for team consistency ([29d5d0c](https://github.com/tim-zitcha/gh-watcher/commit/29d5d0c6f40df712551af174ee5709baa9fec522))
* use screen mouse event instead of click for row selection ([c78ed7f](https://github.com/tim-zitcha/gh-watcher/commit/c78ed7fa712139c31e8ebd6dbe93a510c08b6f4e))
* use tsconfig.eslint.json so test files don't break rootDir constraint ([d090e28](https://github.com/tim-zitcha/gh-watcher/commit/d090e2858a9a68b446d504ffcd20738dd35e34ad))
