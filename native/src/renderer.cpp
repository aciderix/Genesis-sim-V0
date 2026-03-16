#include "renderer.h"
#include <cstdio>
#include <cmath>
#include <vector>
#include <cstring>

// ═══ Shader sources (OpenGL ES 2.0 / GL 2.1 compatible) ══════════════════

#ifdef GENESIS_ANDROID
#define SHADER_HEADER "precision mediump float;\n"
#else
#define SHADER_HEADER ""
#endif

static const char* circleVS = SHADER_HEADER R"(
attribute vec2 aPos;
attribute vec2 aCenter;
attribute float aRadius;
attribute vec4 aColor;
varying vec4 vColor;
varying vec2 vLocalPos;
uniform mat4 uProj;
void main() {
    vec2 worldPos = aCenter + aPos * aRadius;
    gl_Position = uProj * vec4(worldPos, 0.0, 1.0);
    vColor = aColor;
    vLocalPos = aPos;
}
)";

static const char* circleFS = SHADER_HEADER R"(
varying vec4 vColor;
varying vec2 vLocalPos;
void main() {
    float dist = dot(vLocalPos, vLocalPos);
    if (dist > 1.0) discard;
    float alpha = 1.0 - smoothstep(0.7, 1.0, dist);
    gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
}
)";

static const char* lineVS = SHADER_HEADER R"(
attribute vec2 aPos;
attribute vec4 aColor;
varying vec4 vColor;
uniform mat4 uProj;
void main() {
    gl_Position = uProj * vec4(aPos, 0.0, 1.0);
    vColor = aColor;
}
)";

static const char* lineFS = SHADER_HEADER R"(
varying vec4 vColor;
void main() {
    gl_FragColor = vColor;
}
)";

static const char* quadVS = SHADER_HEADER R"(
attribute vec2 aPos;
attribute vec4 aColor;
varying vec4 vColor;
uniform mat4 uProj;
void main() {
    gl_Position = uProj * vec4(aPos, 0.0, 1.0);
    vColor = aColor;
}
)";

static const char* quadFS = SHADER_HEADER R"(
varying vec4 vColor;
void main() {
    gl_FragColor = vColor;
}
)";

// ═══ Constructor / Destructor ═════════════════════════════════════════════

Renderer::Renderer(int ww, int wh) : winWidth(ww), winHeight(wh) {}

Renderer::~Renderer() {
    if (circleVBO) glDeleteBuffers(1, &circleVBO);
    if (lineVBO) glDeleteBuffers(1, &lineVBO);
    if (quadVBO) glDeleteBuffers(1, &quadVBO);
    if (circleProgram) glDeleteProgram(circleProgram);
    if (lineProgram) glDeleteProgram(lineProgram);
    if (quadProgram) glDeleteProgram(quadProgram);
    if (glContext) SDL_GL_DeleteContext(glContext);
    if (window) SDL_DestroyWindow(window);
}

bool Renderer::init() {
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS) < 0) {
        fprintf(stderr, "SDL init failed: %s\n", SDL_GetError());
        return false;
    }

#ifdef GENESIS_ANDROID
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 2);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 0);  // No depth buffer needed for 2D
    SDL_GL_SetAttribute(SDL_GL_STENCIL_SIZE, 0);
    Uint32 flags = SDL_WINDOW_OPENGL | SDL_WINDOW_FULLSCREEN;
#else
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 2);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 1);
    Uint32 flags = SDL_WINDOW_OPENGL | SDL_WINDOW_RESIZABLE;
#endif

    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);

    window = SDL_CreateWindow("Genesis 3.0 - Native",
        SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
        winWidth, winHeight, flags);
    if (!window) {
        fprintf(stderr, "Window creation failed: %s\n", SDL_GetError());
        return false;
    }

#ifdef GENESIS_ANDROID
    SDL_GetWindowSize(window, &winWidth, &winHeight);
#endif

    glContext = SDL_GL_CreateContext(window);
    if (!glContext) {
        fprintf(stderr, "GL context creation failed: %s\n", SDL_GetError());
        return false;
    }

    SDL_GL_SetSwapInterval(1); // VSync

#ifndef GENESIS_ANDROID
    glewExperimental = GL_TRUE;
    GLenum glewErr = glewInit();
    if (glewErr != GLEW_OK) {
        fprintf(stderr, "GLEW init failed: %s\n", glewGetErrorString(glewErr));
        return false;
    }
#endif

    // Compile shaders
    GLuint cvs = compileShader(GL_VERTEX_SHADER, circleVS);
    GLuint cfs = compileShader(GL_FRAGMENT_SHADER, circleFS);
    circleProgram = linkProgram(cvs, cfs);
    glDeleteShader(cvs); glDeleteShader(cfs);

    GLuint lvs = compileShader(GL_VERTEX_SHADER, lineVS);
    GLuint lfs = compileShader(GL_FRAGMENT_SHADER, lineFS);
    lineProgram = linkProgram(lvs, lfs);
    glDeleteShader(lvs); glDeleteShader(lfs);

    GLuint qvs = compileShader(GL_VERTEX_SHADER, quadVS);
    GLuint qfs = compileShader(GL_FRAGMENT_SHADER, quadFS);
    quadProgram = linkProgram(qvs, qfs);
    glDeleteShader(qvs); glDeleteShader(qfs);

    if (!circleProgram || !lineProgram || !quadProgram) return false;

    glGenBuffers(1, &circleVBO);
    glGenBuffers(1, &lineVBO);
    glGenBuffers(1, &quadVBO);

    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);

    return true;
}

GLuint Renderer::compileShader(GLenum type, const char* source) {
    GLuint shader = glCreateShader(type);
    glShaderSource(shader, 1, &source, nullptr);
    glCompileShader(shader);
    GLint ok; glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[512];
        glGetShaderInfoLog(shader, 512, nullptr, log);
        fprintf(stderr, "Shader compile error: %s\n", log);
        return 0;
    }
    return shader;
}

GLuint Renderer::linkProgram(GLuint vs, GLuint fs) {
    if (!vs || !fs) return 0;
    GLuint prog = glCreateProgram();
    glAttachShader(prog, vs);
    glAttachShader(prog, fs);
    glBindAttribLocation(prog, 0, "aPos");
    glBindAttribLocation(prog, 1, "aCenter");
    glBindAttribLocation(prog, 2, "aRadius");
    glBindAttribLocation(prog, 3, "aColor");
    glLinkProgram(prog);
    GLint ok; glGetProgramiv(prog, GL_LINK_STATUS, &ok);
    if (!ok) {
        char log[512];
        glGetProgramInfoLog(prog, 512, nullptr, log);
        fprintf(stderr, "Program link error: %s\n", log);
        return 0;
    }
    return prog;
}

void Renderer::handleResize(int w, int h) {
    winWidth = w; winHeight = h;
    glViewport(0, 0, w, h);
}

void Renderer::setProjection() {
    // Orthographic projection with camera
    float left = camX;
    float right = camX + winWidth / camZoom;
    float bottom = camY + winHeight / camZoom;
    float top = camY;

    float proj[16] = {0};
    proj[0] = 2.0f / (right - left);
    proj[5] = 2.0f / (top - bottom);
    proj[10] = -1.0f;
    proj[12] = -(right + left) / (right - left);
    proj[13] = -(top + bottom) / (top - bottom);
    proj[15] = 1.0f;

    GLint loc;
    glUseProgram(circleProgram);
    loc = glGetUniformLocation(circleProgram, "uProj");
    glUniformMatrix4fv(loc, 1, GL_FALSE, proj);

    glUseProgram(lineProgram);
    loc = glGetUniformLocation(lineProgram, "uProj");
    glUniformMatrix4fv(loc, 1, GL_FALSE, proj);

    glUseProgram(quadProgram);
    loc = glGetUniformLocation(quadProgram, "uProj");
    glUniformMatrix4fv(loc, 1, GL_FALSE, proj);
}

// ═══ Main Render ══════════════════════════════════════════════════════════

void Renderer::render(const SimState& state, const SimConfig& config) {
    // Viewport culling bounds
    float viewLeft = camX;
    float viewRight = camX + winWidth / camZoom;
    float viewTop = camY;
    float viewBottom = camY + winHeight / camZoom;
    float margin = 50.0f;

    setProjection();

    // Background
    float bgLight = state.dayLight * 0.12f;
    glClearColor(bgLight, bgLight, bgLight * 1.2f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT);

    // ─── Zones ────────────────────────────────────────────────────
    {
        // Build circle data for zones
        std::vector<float> zoneData;
        for (auto& z : state.zones) {
            float r = 0, g = 0, b = 0, a = 0.2f;
            switch (z.type) {
                case ZoneType::Toxic:       r = 0.94f; g = 0.27f; b = 0.27f; break;
                case ZoneType::Shadow:      r = 0; g = 0; b = 0; a = 0.5f; break;
                case ZoneType::Current:     r = 0.23f; g = 0.51f; b = 0.96f; break;
                case ZoneType::ThermalVent: r = 1.0f; g = 0.55f; b = 0; a = 0.3f; break;
                case ZoneType::Radiation:   r = 1.0f; g = 1.0f; b = 0; a = 0.15f; break;
                case ZoneType::NutrientRich:r = 0.13f; g = 0.77f; b = 0.37f; a = 0.15f; break;
            }
            // 6 vertices per circle (2 triangles for quad)
            float verts[] = {-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1};
            for (int i = 0; i < 6; i++) {
                zoneData.push_back(verts[i*2]);    // aPos.x
                zoneData.push_back(verts[i*2+1]);  // aPos.y
                zoneData.push_back(z.x);  // aCenter.x
                zoneData.push_back(z.y);  // aCenter.y
                zoneData.push_back(z.r);  // aRadius
                zoneData.push_back(r); zoneData.push_back(g);
                zoneData.push_back(b); zoneData.push_back(a);
            }
        }
        if (!zoneData.empty()) {
            glUseProgram(circleProgram);
            glBindBuffer(GL_ARRAY_BUFFER, circleVBO);
            glBufferData(GL_ARRAY_BUFFER, zoneData.size() * sizeof(float), zoneData.data(), GL_DYNAMIC_DRAW);
            int stride = 9 * sizeof(float);
            glEnableVertexAttribArray(0);
            glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, stride, (void*)0);
            glEnableVertexAttribArray(1);
            glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, stride, (void*)(2*sizeof(float)));
            glEnableVertexAttribArray(2);
            glVertexAttribPointer(2, 1, GL_FLOAT, GL_FALSE, stride, (void*)(4*sizeof(float)));
            glEnableVertexAttribArray(3);
            glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, stride, (void*)(5*sizeof(float)));
            glDrawArrays(GL_TRIANGLES, 0, (int)(zoneData.size() / 9));
        }
    }

    // ─── Obstacles ────────────────────────────────────────────────
    {
        std::vector<float> quadData;
        for (auto& o : state.obstacles) {
            float verts[] = {
                o.x, o.y,          o.x+o.w, o.y,      o.x+o.w, o.y+o.h,
                o.x, o.y,          o.x+o.w, o.y+o.h,  o.x, o.y+o.h
            };
            for (int i = 0; i < 6; i++) {
                quadData.push_back(verts[i*2]);
                quadData.push_back(verts[i*2+1]);
                quadData.push_back(0.2f); quadData.push_back(0.2f);
                quadData.push_back(0.2f); quadData.push_back(0.8f);
            }
        }
        if (!quadData.empty()) {
            glUseProgram(quadProgram);
            glBindBuffer(GL_ARRAY_BUFFER, quadVBO);
            glBufferData(GL_ARRAY_BUFFER, quadData.size() * sizeof(float), quadData.data(), GL_DYNAMIC_DRAW);
            int stride = 6 * sizeof(float);
            glEnableVertexAttribArray(0);
            glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, stride, (void*)0);
            glDisableVertexAttribArray(1);
            glDisableVertexAttribArray(2);
            glEnableVertexAttribArray(3);
            glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, stride, (void*)(2*sizeof(float)));
            glDrawArrays(GL_TRIANGLES, 0, (int)(quadData.size() / 6));
        }
    }

    // ─── Nutrients ────────────────────────────────────────────────
    {
        std::vector<float> nutrData;
        for (auto& n : state.nutrients) {
            if (n.x < viewLeft - margin || n.x > viewRight + margin ||
                n.y < viewTop - margin || n.y > viewBottom + margin) continue;
            float radius = std::sqrt(n.amount);
            float r = n.isCorpse ? 0.47f : 0.13f;
            float g = n.isCorpse ? 0.21f : 0.77f;
            float b = n.isCorpse ? 0.06f : 0.37f;
            float verts[] = {-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1};
            for (int i = 0; i < 6; i++) {
                nutrData.push_back(verts[i*2]);
                nutrData.push_back(verts[i*2+1]);
                nutrData.push_back(n.x); nutrData.push_back(n.y);
                nutrData.push_back(radius);
                nutrData.push_back(r); nutrData.push_back(g);
                nutrData.push_back(b); nutrData.push_back(0.9f);
            }
        }
        if (!nutrData.empty()) {
            glUseProgram(circleProgram);
            glBindBuffer(GL_ARRAY_BUFFER, circleVBO);
            glBufferData(GL_ARRAY_BUFFER, nutrData.size() * sizeof(float), nutrData.data(), GL_DYNAMIC_DRAW);
            int stride = 9 * sizeof(float);
            glEnableVertexAttribArray(0);
            glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, stride, (void*)0);
            glEnableVertexAttribArray(1);
            glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, stride, (void*)(2*sizeof(float)));
            glEnableVertexAttribArray(2);
            glVertexAttribPointer(2, 1, GL_FLOAT, GL_FALSE, stride, (void*)(4*sizeof(float)));
            glEnableVertexAttribArray(3);
            glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, stride, (void*)(5*sizeof(float)));
            glDrawArrays(GL_TRIANGLES, 0, (int)(nutrData.size() / 9));
        }
    }

    // ─── Viruses ──────────────────────────────────────────────────
    {
        std::vector<float> virusData;
        for (auto& v : state.viruses) {
            if (v.x < viewLeft - margin || v.x > viewRight + margin ||
                v.y < viewTop - margin || v.y > viewBottom + margin) continue;
            float verts[] = {-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1};
            for (int i = 0; i < 6; i++) {
                virusData.push_back(verts[i*2]);
                virusData.push_back(verts[i*2+1]);
                virusData.push_back(v.x); virusData.push_back(v.y);
                virusData.push_back(v.radius);
                virusData.push_back(0.94f); virusData.push_back(0.27f);
                virusData.push_back(0.27f); virusData.push_back(0.9f);
            }
        }
        if (!virusData.empty()) {
            glUseProgram(circleProgram);
            glBindBuffer(GL_ARRAY_BUFFER, circleVBO);
            glBufferData(GL_ARRAY_BUFFER, virusData.size() * sizeof(float), virusData.data(), GL_DYNAMIC_DRAW);
            int stride = 9 * sizeof(float);
            glEnableVertexAttribArray(0);
            glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, stride, (void*)0);
            glEnableVertexAttribArray(1);
            glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, stride, (void*)(2*sizeof(float)));
            glEnableVertexAttribArray(2);
            glVertexAttribPointer(2, 1, GL_FLOAT, GL_FALSE, stride, (void*)(4*sizeof(float)));
            glEnableVertexAttribArray(3);
            glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, stride, (void*)(5*sizeof(float)));
            glDrawArrays(GL_TRIANGLES, 0, (int)(virusData.size() / 9));
        }
    }

    // ─── Particles ────────────────────────────────────────────────
    {
        std::vector<float> particleData;
        for (auto& p : state.particles) {
            if (p.dead) continue;
            if (p.x < viewLeft - margin || p.x > viewRight + margin ||
                p.y < viewTop - margin || p.y > viewBottom + margin) continue;

            float r = p.genome.color[0] / 255.0f;
            float g = p.genome.color[1] / 255.0f;
            float b = p.genome.color[2] / 255.0f;
            float verts[] = {-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1};
            for (int i = 0; i < 6; i++) {
                particleData.push_back(verts[i*2]);
                particleData.push_back(verts[i*2+1]);
                particleData.push_back(p.x); particleData.push_back(p.y);
                particleData.push_back(p.radius);
                particleData.push_back(r); particleData.push_back(g);
                particleData.push_back(b); particleData.push_back(1.0f);
            }
        }
        if (!particleData.empty()) {
            glUseProgram(circleProgram);
            glBindBuffer(GL_ARRAY_BUFFER, circleVBO);
            glBufferData(GL_ARRAY_BUFFER, particleData.size() * sizeof(float), particleData.data(), GL_DYNAMIC_DRAW);
            int stride = 9 * sizeof(float);
            glEnableVertexAttribArray(0);
            glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, stride, (void*)0);
            glEnableVertexAttribArray(1);
            glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, stride, (void*)(2*sizeof(float)));
            glEnableVertexAttribArray(2);
            glVertexAttribPointer(2, 1, GL_FLOAT, GL_FALSE, stride, (void*)(4*sizeof(float)));
            glEnableVertexAttribArray(3);
            glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, stride, (void*)(5*sizeof(float)));
            glDrawArrays(GL_TRIANGLES, 0, (int)(particleData.size() / 9));
        }
    }

    // ─── Bonds ────────────────────────────────────────────────────
    {
        // Build position map
        std::unordered_map<int, const Particle*> posMap;
        for (auto& p : state.particles)
            if (!p.dead) posMap[p.id] = &p;

        std::vector<float> lineData;
        for (auto& b : state.bonds) {
            auto it1 = posMap.find(b.p1), it2 = posMap.find(b.p2);
            if (it1 == posMap.end() || it2 == posMap.end()) continue;
            auto* p1 = it1->second; auto* p2 = it2->second;
            float r = 1, g = 1, b2 = 1, a = 0.3f;
            if (b.type == BondType::Neural) { r = 0.23f; g = 0.51f; b2 = 0.96f; a = 0.5f; }
            else if (b.type == BondType::Vascular) { r = 0.94f; g = 0.27f; b2 = 0.27f; a = 0.4f; }
            lineData.push_back(p1->x); lineData.push_back(p1->y);
            lineData.push_back(r); lineData.push_back(g); lineData.push_back(b2); lineData.push_back(a);
            lineData.push_back(p2->x); lineData.push_back(p2->y);
            lineData.push_back(r); lineData.push_back(g); lineData.push_back(b2); lineData.push_back(a);
        }
        if (!lineData.empty()) {
            glUseProgram(lineProgram);
            glBindBuffer(GL_ARRAY_BUFFER, lineVBO);
            glBufferData(GL_ARRAY_BUFFER, lineData.size() * sizeof(float), lineData.data(), GL_DYNAMIC_DRAW);
            int stride = 6 * sizeof(float);
            glEnableVertexAttribArray(0);
            glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, stride, (void*)0);
            glDisableVertexAttribArray(1);
            glDisableVertexAttribArray(2);
            glEnableVertexAttribArray(3);
            glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, stride, (void*)(2*sizeof(float)));
            glLineWidth(1.5f);
            glDrawArrays(GL_LINES, 0, (int)(lineData.size() / 6));
        }
    }

    // ─── Sounds (expanding rings) ─────────────────────────────────
    {
        std::vector<float> soundData;
        const int segments = 32;
        for (auto& s : state.sounds) {
            if (s.volume <= 0) continue;
            for (int i = 0; i < segments; i++) {
                float a1 = (float)i / segments * 6.2831853f;
                float a2 = (float)(i+1) / segments * 6.2831853f;
                soundData.push_back(s.x + std::cos(a1) * s.radius);
                soundData.push_back(s.y + std::sin(a1) * s.radius);
                soundData.push_back(1); soundData.push_back(1);
                soundData.push_back(1); soundData.push_back(s.volume * 0.15f);
                soundData.push_back(s.x + std::cos(a2) * s.radius);
                soundData.push_back(s.y + std::sin(a2) * s.radius);
                soundData.push_back(1); soundData.push_back(1);
                soundData.push_back(1); soundData.push_back(s.volume * 0.15f);
            }
        }
        if (!soundData.empty()) {
            glUseProgram(lineProgram);
            glBindBuffer(GL_ARRAY_BUFFER, lineVBO);
            glBufferData(GL_ARRAY_BUFFER, soundData.size() * sizeof(float), soundData.data(), GL_DYNAMIC_DRAW);
            int stride = 6 * sizeof(float);
            glEnableVertexAttribArray(0);
            glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, stride, (void*)0);
            glDisableVertexAttribArray(1); glDisableVertexAttribArray(2);
            glEnableVertexAttribArray(3);
            glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, stride, (void*)(2*sizeof(float)));
            glDrawArrays(GL_LINES, 0, (int)(soundData.size() / 6));
        }
    }

    SDL_GL_SwapWindow(window);
}
