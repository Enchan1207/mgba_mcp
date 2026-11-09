add_library(mgba_mcp_library)

target_sources(mgba_mcp_library PRIVATE
    func.c
)

target_include_directories(mgba_mcp_library PUBLIC
    $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>
)
