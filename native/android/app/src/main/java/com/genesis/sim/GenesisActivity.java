package com.genesis.sim;

import org.libsdl.app.SDLActivity;

public class GenesisActivity extends SDLActivity {
    @Override
    protected String[] getLibraries() {
        return new String[] {
            "SDL2",
            "main"
        };
    }
}
