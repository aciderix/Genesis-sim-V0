#pragma once
#include "types.h"

#ifdef GENESIS_ANDROID
#include <GLES2/gl2.h>
#include <SDL.h>
#else
#include <GL/glew.h>
#include <SDL2/SDL.h>
#include <SDL2/SDL_opengl.h>
#endif

class Renderer {
public:
    Renderer(int windowWidth, int windowHeight);
    ~Renderer();

    bool init();
    void render(const SimState& state, const SimConfig& config);
    void handleResize(int w, int h);

    // Camera
    float camX = 0, camY = 0, camZoom = 1.0f;

    SDL_Window* window = nullptr;
    SDL_GLContext glContext = nullptr;
    int winWidth, winHeight;

private:

    // Shader programs
    GLuint circleProgram = 0;
    GLuint lineProgram = 0;
    GLuint quadProgram = 0;

    // Vertex buffers
    GLuint circleVBO = 0;
    GLuint lineVBO = 0;
    GLuint quadVBO = 0;

    // Helpers
    GLuint compileShader(GLenum type, const char* source);
    GLuint linkProgram(GLuint vs, GLuint fs);

    void drawCircle(float x, float y, float radius, float r, float g, float b, float a);
    void drawCircleBatch(const float* data, int count); // x,y,radius,r,g,b,a per entry
    void drawLine(float x1, float y1, float x2, float y2, float r, float g, float b, float a);
    void drawLineBatch(const float* data, int count); // x1,y1,x2,y2,r,g,b,a
    void drawQuad(float x, float y, float w, float h, float r, float g, float b, float a);

    // Projection
    void setProjection();
};
