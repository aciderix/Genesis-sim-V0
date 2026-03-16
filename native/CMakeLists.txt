cmake_minimum_required(VERSION 3.10)
project(genesis VERSION 3.0 LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)

# ═══ Source files ══════════════════════════════════════════════════════════
set(GENESIS_SOURCES
    src/main.cpp
    src/engine.cpp
    src/renderer.cpp
    src/gui.cpp
)

# ═══ Dear ImGui sources ═══════════════════════════════════════════════════
set(IMGUI_DIR ${CMAKE_CURRENT_SOURCE_DIR}/src/imgui)
set(IMGUI_SOURCES
    ${IMGUI_DIR}/imgui.cpp
    ${IMGUI_DIR}/imgui_draw.cpp
    ${IMGUI_DIR}/imgui_tables.cpp
    ${IMGUI_DIR}/imgui_widgets.cpp
    ${IMGUI_DIR}/imgui_demo.cpp
    ${IMGUI_DIR}/imgui_impl_sdl2.cpp
    ${IMGUI_DIR}/imgui_impl_opengl2.cpp
)

# ═══ Executable ════════════════════════════════════════════════════════════
# On Windows: WIN32 flag hides the console window
if(WIN32)
    add_executable(genesis WIN32 ${GENESIS_SOURCES} ${IMGUI_SOURCES})
else()
    add_executable(genesis ${GENESIS_SOURCES} ${IMGUI_SOURCES})
endif()

# ═══ Include directories ══════════════════════════════════════════════════
target_include_directories(genesis PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${IMGUI_DIR}
)

# ═══ Find SDL2 ════════════════════════════════════════════════════════════
find_package(PkgConfig QUIET)
if(PkgConfig_FOUND)
    pkg_check_modules(SDL2 QUIET sdl2)
endif()

if(NOT SDL2_FOUND)
    find_package(SDL2 QUIET)
    if(SDL2_FOUND)
        set(SDL2_INCLUDE_DIRS ${SDL2_INCLUDE_DIRS})
        set(SDL2_LIBRARIES SDL2::SDL2)
        if(TARGET SDL2::SDL2main)
            list(APPEND SDL2_LIBRARIES SDL2::SDL2main)
        endif()
    endif()
endif()

if(NOT SDL2_FOUND)
    # Fallback: manual search
    find_path(SDL2_INCLUDE_DIRS SDL2/SDL.h SDL.h
        PATHS /usr/include /usr/local/include /opt/homebrew/include
              $ENV{SDL2DIR}/include)
    find_library(SDL2_LIB NAMES SDL2 SDL2d
        PATHS /usr/lib /usr/local/lib /opt/homebrew/lib
              $ENV{SDL2DIR}/lib)
    if(SDL2_INCLUDE_DIRS AND SDL2_LIB)
        set(SDL2_LIBRARIES ${SDL2_LIB})
        set(SDL2_FOUND TRUE)
    endif()
endif()

if(SDL2_FOUND)
    target_include_directories(genesis PRIVATE ${SDL2_INCLUDE_DIRS})
    target_link_libraries(genesis PRIVATE ${SDL2_LIBRARIES})
else()
    message(FATAL_ERROR "SDL2 not found! Install SDL2 development libraries.")
endif()

# ═══ Find OpenGL + GLEW ══════════════════════════════════════════════════
find_package(OpenGL REQUIRED)
target_link_libraries(genesis PRIVATE OpenGL::GL)

# GLEW
if(PkgConfig_FOUND)
    pkg_check_modules(GLEW QUIET glew)
endif()
if(NOT GLEW_FOUND)
    find_package(GLEW QUIET)
    if(GLEW_FOUND)
        set(GLEW_LIBRARIES GLEW::GLEW)
    endif()
endif()
if(NOT GLEW_FOUND)
    find_library(GLEW_LIB NAMES GLEW glew glew32
        PATHS /usr/lib /usr/local/lib /opt/homebrew/lib)
    find_path(GLEW_INCLUDE_DIRS GL/glew.h
        PATHS /usr/include /usr/local/include /opt/homebrew/include)
    if(GLEW_LIB AND GLEW_INCLUDE_DIRS)
        set(GLEW_LIBRARIES ${GLEW_LIB})
        set(GLEW_FOUND TRUE)
    endif()
endif()

if(GLEW_FOUND)
    target_include_directories(genesis PRIVATE ${GLEW_INCLUDE_DIRS})
    target_link_libraries(genesis PRIVATE ${GLEW_LIBRARIES})
else()
    message(FATAL_ERROR "GLEW not found! Install GLEW development libraries.")
endif()

# ═══ Platform-specific ════════════════════════════════════════════════════
if(WIN32)
    target_link_libraries(genesis PRIVATE imm32 version winmm setupapi)
    # SDL2main provides WinMain -> main redirect
    target_link_libraries(genesis PRIVATE SDL2::SDL2main)
endif()

if(APPLE)
    find_library(COCOA_LIBRARY Cocoa)
    find_library(IOKIT_LIBRARY IOKit)
    if(COCOA_LIBRARY)
        target_link_libraries(genesis PRIVATE ${COCOA_LIBRARY})
    endif()
    if(IOKIT_LIBRARY)
        target_link_libraries(genesis PRIVATE ${IOKIT_LIBRARY})
    endif()
endif()

# ═══ Compiler flags ══════════════════════════════════════════════════════
if(CMAKE_BUILD_TYPE STREQUAL "Release" OR NOT CMAKE_BUILD_TYPE)
    target_compile_options(genesis PRIVATE -O2)
endif()

if(MSVC)
    target_compile_options(genesis PRIVATE /W3)
else()
    target_compile_options(genesis PRIVATE -Wall -Wextra -Wno-unused-parameter -Wno-missing-field-initializers)
endif()

# ═══ Output ══════════════════════════════════════════════════════════════
message(STATUS "Genesis 3.0 Native + Dear ImGui GUI")
message(STATUS "  SDL2: ${SDL2_LIBRARIES}")
message(STATUS "  OpenGL: ${OPENGL_LIBRARIES}")
message(STATUS "  GLEW: ${GLEW_LIBRARIES}")
message(STATUS "  ImGui: ${IMGUI_DIR}")
# ImGui GUI integration - trigger native CI
