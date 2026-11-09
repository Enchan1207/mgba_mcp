cmake_minimum_required(VERSION 4.4.4)

project(
    mgba_mcp
    VERSION 0.1.0
    LANGUAGES C CXX
)

add_subdirectory(src)

option(mgba_mcp_BUILD_CLI "Build CLI tool" ${PROJECT_IS_TOP_LEVEL})
if(mgba_mcp_BUILD_CLI)
    add_subdirectory(cli)
endif()
