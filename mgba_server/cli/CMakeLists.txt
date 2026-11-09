add_executable(mgba_mcp_cli)

target_sources(mgba_mcp_cli PRIVATE
    main.c
)

target_link_libraries(mgba_mcp_cli PRIVATE 
    mgba
)
