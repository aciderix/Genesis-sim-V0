cmake_minimum_required(VERSION 3.16)
project(genesis-native VERSION 3.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Sources
set(SOURCES
    src/main.cpp
    src/engine.cpp
    src/renderer.cpp
)

if(ANDROID)
    # Android: build as shared library for SDL2
    add_library(main SHARED ${SOURCES})
    target_compile_definitions(main PRIVATE GENESIS_ANDROID=1)
    set(TARGET_NAME main)

    # SDL2 from Android prefab or local source
    find_package(SDL2 QUIET CONFIG)
    if(SDL2_FOUND)
        target_link_libraries(main PRIVATE SDL2::SDL2)
    else()
        if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/SDL2-2.30.9/CMakeLists.txt")
            add_subdirectory(SDL2-2.30.9)
            target_link_libraries(main PRIVATE SDL2)
        endif()
    endif()

    target_link_libraries(main PRIVATE GLESv2 log android)

else()
    # Desktop: build as executable
    add_executable(genesis ${SOURCES})
    set(TARGET_NAME genesis)

    # GLEW (required for GL 2.0+ functions on desktop)
    find_package(GLEW QUIET)
    if(NOT GLEW_FOUND)
        find_package(PkgConfig QUIET)
        if(PkgConfig_FOUND)
            pkg_check_modules(GLEW IMPORTED_TARGET glew)
        endif()
    endif()

    # SDL2 (try CMake config first, then pkg-config)
    find_package(SDL2 QUIET CONFIG)
    if(NOT SDL2_FOUND)
        find_package(PkgConfig QUIET)
        if(PkgConfig_FOUND)
            pkg_check_modules(SDL2 IMPORTED_TARGET sdl2)
        endif()
    endif()

    # OpenGL
    find_package(OpenGL REQUIRED)

    if(WIN32)
        target_link_libraries(genesis PRIVATE ${SDL2_LIBRARIES} GLEW::GLEW OpenGL::GL)
    elseif(TARGET SDL2::SDL2 AND TARGET GLEW::GLEW)
        target_link_libraries(genesis PRIVATE SDL2::SDL2 SDL2::SDL2main GLEW::GLEW OpenGL::GL)
    elseif(TARGET PkgConfig::SDL2 AND TARGET PkgConfig::GLEW)
        target_link_libraries(genesis PRIVATE PkgConfig::SDL2 PkgConfig::GLEW OpenGL::GL)
    elseif(TARGET SDL2::SDL2)
        target_link_libraries(genesis PRIVATE SDL2::SDL2 SDL2::SDL2main GLEW::GLEW OpenGL::GL)
    else()
        target_include_directories(genesis PRIVATE ${SDL2_INCLUDE_DIRS} ${GLEW_INCLUDE_DIRS})
        target_link_libraries(genesis PRIVATE ${SDL2_LIBRARIES} ${GLEW_LIBRARIES} OpenGL::GL)
    endif()

    # Copy shaders to build dir (if any)
    if(EXISTS "${CMAKE_SOURCE_DIR}/shaders")
        add_custom_command(TARGET genesis POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_directory
            ${CMAKE_SOURCE_DIR}/shaders $<TARGET_FILE_DIR:genesis>/shaders
        )
    endif()

    install(TARGETS genesis RUNTIME DESTINATION bin)
endif()

# Optimization flags for Release
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    if(MSVC)
        target_compile_options(${TARGET_NAME} PRIVATE /O2 /fp:fast)
    elseif(NOT ANDROID)
        target_compile_options(${TARGET_NAME} PRIVATE -O3 -ffast-math -march=native)
    else()
        target_compile_options(${TARGET_NAME} PRIVATE -O3 -ffast-math)
    endif()
endif()
