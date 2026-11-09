cmake_minimum_required(VERSION 3.28)

project(
    mgba_server
    VERSION 0.1.0
    LANGUAGES C CXX
)

include(FetchContent)

set(LIBMGBA_ONLY ON)
# mGBA 0.10.5 declares compatibility with CMake 3.1, which CMake 4 no longer supports.
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)
FetchContent_Declare(mgba
    GIT_REPOSITORY https://github.com/mgba-emu/mgba.git
    GIT_TAG 0.10.5
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(mgba)

add_subdirectory(src)

option(mgba_server_BUILD_CLI "Build CLI tool" ${PROJECT_IS_TOP_LEVEL})
if(mgba_server_BUILD_CLI)
    add_subdirectory(cli)
endif()

option(mgba_server_BUILD_TESTS "Build GoogleTest tests" OFF)
if(mgba_server_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()
