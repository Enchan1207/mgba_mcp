add_executable(mgba_server_cli)

target_sources(mgba_server_cli PRIVATE
    main.c
)

target_link_libraries(mgba_server_cli PRIVATE
    mgba
)
