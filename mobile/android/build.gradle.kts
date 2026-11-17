allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}
// Flutter's debug/profile builds compile plugin C++ with CMAKE_BUILD_TYPE=Debug, which skips
// Stockfish's -O3/NEON flags (about 30x slower). Force an optimized engine in every variant.
subprojects {
    if (name.startsWith("multistockfish")) {
        plugins.withId("com.android.library") {
            extensions.getByName("android").withGroovyBuilder {
                "defaultConfig" {
                    "externalNativeBuild" { "cmake" { "arguments"("-DCMAKE_BUILD_TYPE=Release") } }
                }
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
