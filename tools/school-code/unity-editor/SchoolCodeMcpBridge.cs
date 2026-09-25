#if UNITY_EDITOR
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Security.Cryptography;
using System.Threading;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

// Copy this file to Assets/Editor/SchoolCodeMcpBridge.cs in a project you control.
// It exposes only a loopback, bearer-protected, fixed-action bridge to the School Code extension.
// It never evaluates C# or shell commands received over HTTP.
[InitializeOnLoad]
public static class SchoolCodeMcpBridge
{
    private const string TokenKey = "SchoolCode.McpBridgeToken";
    private const string PortKey = "SchoolCode.McpBridgePort";
    private const int DefaultPort = 18777;
    private const int PortSearchCount = 64;
    private const int MaxBodyBytes = 1024 * 1024;
    private static readonly ConcurrentQueue<Pending> Queue = new ConcurrentQueue<Pending>();
    private static readonly object LogLock = new object();
    private static readonly List<LogInfo> Logs = new List<LogInfo>();
    private const int MaxLogs = 500;
    private static HttpListener listener;
    private static Thread listenerThread;
    private static string token;
    private static int port;

    [Serializable]
    private sealed class Request
    {
        public string action;
        public string path;
        public string scene;
        public string query;
        public string game_object_id;
        public string component_type;
        public string property;
        public string value;
        public string name;
        public string parent_id;
        public string prefab_path;
        public string material_path;
        public string parameter_type;
        public int max_width;
        public int max_height;
        public int slot;
        public int limit;
        public int log_limit;
        public bool paused;
        public bool clear;
        public Vector3Data position;
        public Vector3Data rotation;
        public Vector3Data scale;
    }

    [Serializable]
    private sealed class Vector3Data
    {
        public float x;
        public float y;
        public float z;
        public Vector3 ToVector3() { return new Vector3(x, y, z); }
    }

    [Serializable]
    private sealed class GameObjectInfo
    {
        public string id;
        public string name;
        public string path;
        public bool active;
    }

    [Serializable]
    private sealed class ComponentInfo
    {
        public string type;
        public string json;
    }

    [Serializable]
    private sealed class LogInfo
    {
        public string type;
        public string condition;
        public string stack_trace;
        public string time;
    }

    [Serializable]
    private sealed class AnimatorParameterInfo
    {
        public string name;
        public string type;
        public float default_float;
        public int default_int;
        public bool default_bool;
    }

    [Serializable]
    private sealed class Response
    {
        public bool ok;
        public string error;
        public string scene;
        public GameObjectInfo[] game_objects;
        public ComponentInfo component;
        public string game_object_id;
        public string property;
        public string mime;
        public string image_base64;
        public int width;
        public int height;
        public bool is_playing;
        public bool is_paused;
        public bool is_compiling;
        public bool is_updating;
        public string active_scene;
        public string build_target;
        public string[] build_scenes;
        public LogInfo[] logs;
        public AnimatorParameterInfo[] animator_parameters;
        public string animator_controller;
    }

    private sealed class Pending
    {
        public Request request;
        public readonly ManualResetEvent Done = new ManualResetEvent(false);
        public Response Response;
    }

    static SchoolCodeMcpBridge()
    {
        EditorApplication.update += Pump;
        Application.logMessageReceived += OnLog;
        AssemblyReloadEvents.beforeAssemblyReload += Stop;
        EditorApplication.quitting += Stop;
        // Loading the bridge is enough to start it. The VS Code extension installs
        // the file and places the per-user token before opening the project.
        Start();
    }

    private static string TokenFilePath()
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return Path.Combine(home, ".school-code", "unity-editor-token");
    }

    private static string PortFilePath(string projectRoot)
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var normalized = projectRoot.Replace('\\', '/').ToLowerInvariant();
        using (var sha = SHA256.Create())
        {
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(normalized));
            var hex = BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
            return Path.Combine(home, ".school-code", "unity-editor-ports", hex + ".port");
        }
    }

    private static void SavePort(string projectRoot, int selectedPort)
    {
        try
        {
            var file = PortFilePath(projectRoot);
            Directory.CreateDirectory(Path.GetDirectoryName(file));
            File.WriteAllText(file, selectedPort.ToString());
        }
        catch (Exception e) { Debug.LogWarning("School Code Unity Editor MCP port registry could not be saved: " + e.Message); }
    }

    private static int LoadRegisteredPort(string projectRoot)
    {
        try
        {
            var value = File.ReadAllText(PortFilePath(projectRoot)).Trim();
            if (int.TryParse(value, out var registered) && registered >= 1024 && registered <= 65535) return registered;
        }
        catch { }
        return 0;
    }

    private static string LoadToken()
    {
        try
        {
            var fileToken = File.ReadAllText(TokenFilePath()).Trim();
            if (!string.IsNullOrEmpty(fileToken))
            {
                EditorPrefs.SetString(TokenKey, fileToken);
                return fileToken;
            }
        }
        catch { }
        return EditorPrefs.GetString(TokenKey, "");
    }

    [MenuItem("School Code/MCP Bridge/Start")]
    public static void Start()
    {
        // Unity's AssetImportWorker processes load Editor assemblies too. They
        // run in batch mode and must never claim the user's MCP loopback port;
        // only the interactive Unity Editor should host this bridge.
        if (Application.isBatchMode)
        {
            Debug.Log("School Code Unity Editor MCP bridge skipped in batch mode.");
            return;
        }
        if (listener != null && listener.IsListening) return;
        var projectRoot = Directory.GetParent(Application.dataPath).FullName;
        var preferredPort = LoadRegisteredPort(projectRoot);
        if (preferredPort == 0) preferredPort = EditorPrefs.GetInt(PortKey, DefaultPort);
        if (preferredPort < 1024 || preferredPort > 65535) preferredPort = DefaultPort;
        token = LoadToken();
        if (string.IsNullOrEmpty(token))
        {
            token = Guid.NewGuid().ToString("N");
            EditorPrefs.SetString(TokenKey, token);
            Debug.Log("School Code Unity Editor MCP token created. Use School Code/MCP Bridge/Copy Token.");
        }
        Exception lastError = null;
        for (var offset = 0; offset < PortSearchCount; offset++)
        {
            var candidate = preferredPort + offset;
            if (candidate > 65535) break;
            var candidateListener = new HttpListener();
            candidateListener.Prefixes.Add("http://127.0.0.1:" + candidate + "/");
            try
            {
                candidateListener.Start();
                listener = candidateListener;
                port = candidate;
                EditorPrefs.SetInt(PortKey, port);
                SavePort(projectRoot, port);
                listenerThread = new Thread(ListenLoop) { IsBackground = true, Name = "SchoolCodeMcpBridge" };
                listenerThread.Start();
                Debug.Log("School Code Unity Editor MCP bridge listening on http://127.0.0.1:" + port + "/mcp");
                return;
            }
            catch (Exception e)
            {
                lastError = e;
                try { candidateListener.Close(); } catch { }
            }
        }
        listener = null;
        Debug.LogError("School Code Unity Editor MCP bridge failed to start: " + (lastError == null ? "사용 가능한 포트를 찾지 못했습니다." : lastError.Message) + " (18777부터 64개 포트를 확인했습니다.)");
    }

    [MenuItem("School Code/MCP Bridge/Stop")]
    public static void Stop()
    {
        try { listener?.Stop(); listener?.Close(); } catch { }
        listener = null;
        listenerThread = null;
        while (Queue.TryDequeue(out var pending))
        {
            pending.Response = Error("Unity Editor 브리지가 종료되었습니다.");
            pending.Done.Set();
        }
    }

    private static void OnLog(string condition, string stackTrace, LogType type)
    {
        lock (LogLock)
        {
            Logs.Add(new LogInfo { type = type.ToString(), condition = condition, stack_trace = stackTrace, time = DateTime.Now.ToString("o") });
            while (Logs.Count > MaxLogs) Logs.RemoveAt(0);
        }
    }

    [MenuItem("School Code/MCP Bridge/Copy Token")]
    public static void CopyToken()
    {
        if (string.IsNullOrEmpty(token)) Start();
        GUIUtility.systemCopyBuffer = token ?? "";
        Debug.Log("School Code Unity Editor MCP token copied to the clipboard.");
    }

    private static void ListenLoop()
    {
        while (listener != null && listener.IsListening)
        {
            try
            {
                var context = listener.GetContext();
                ThreadPool.QueueUserWorkItem(_ => Handle(context));
            }
            catch { if (listener == null || !listener.IsListening) break; }
        }
    }

    private static void Handle(HttpListenerContext context)
    {
        try
        {
            if (context.Request.HttpMethod != "POST" || context.Request.Url.AbsolutePath != "/mcp")
            {
                Write(context, 404, Error("지원하지 않는 Unity Editor 브리지 경로입니다."));
                return;
            }
            var expected = "Bearer " + token;
            if (!string.Equals(context.Request.Headers["Authorization"], expected, StringComparison.Ordinal))
            {
                Write(context, 401, Error("Unity Editor 브리지 인증이 필요합니다."));
                return;
            }
            if (context.Request.ContentLength64 > MaxBodyBytes)
            {
                Write(context, 413, Error("요청이 너무 큽니다."));
                return;
            }
            string body;
            using (var reader = new StreamReader(context.Request.InputStream, Encoding.UTF8)) body = reader.ReadToEnd();
            if (Encoding.UTF8.GetByteCount(body) > MaxBodyBytes)
            {
                Write(context, 413, Error("요청이 너무 큽니다."));
                return;
            }
            var request = JsonUtility.FromJson<Request>(body);
            if (request == null || string.IsNullOrEmpty(request.action))
            {
                Write(context, 400, Error("action이 필요합니다."));
                return;
            }
            var pending = new Pending { request = request };
            Queue.Enqueue(pending);
            if (!pending.Done.WaitOne(TimeSpan.FromSeconds(30)))
            {
                Write(context, 504, Error("Unity Editor 작업 시간이 초과되었습니다."));
                return;
            }
            Write(context, pending.Response != null && pending.Response.ok ? 200 : 400, pending.Response ?? Error("빈 응답입니다."));
        }
        catch (Exception e) { Write(context, 400, Error(e.Message)); }
    }

    private static void Write(HttpListenerContext context, int status, Response response)
    {
        try
        {
            var bytes = Encoding.UTF8.GetBytes(JsonUtility.ToJson(response));
            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json; charset=utf-8";
            context.Response.ContentLength64 = bytes.Length;
            using (var stream = context.Response.OutputStream) stream.Write(bytes, 0, bytes.Length);
        }
        catch { try { context.Response.Close(); } catch { } }
    }

    private static void Pump()
    {
        if (!Queue.TryDequeue(out var pending)) return;
        try { pending.Response = Execute(pending.request); }
        catch (Exception e) { pending.Response = Error(e.Message); }
        finally { pending.Done.Set(); }
    }

    private static Response Execute(Request request)
    {
        switch (request.action)
        {
            case "unity_open_scene": return OpenScene(request.scene);
            case "unity_find_gameobjects": return FindGameObjects(request.query ?? "");
            case "unity_get_component": return GetComponent(request);
            case "unity_set_component": return SetComponent(request);
            case "unity_create_gameobject": return CreateGameObject(request);
            case "unity_save_scene": return SaveScene();
            case "unity_capture_scene": return CaptureScene(request);
            case "unity_capture_game": return CaptureGame(request);
            case "unity_model_preview": return ModelPreview(request);
            case "unity_play": return Play();
            case "unity_pause": return Pause(request.paused);
            case "unity_stop": return StopPlayMode();
            case "unity_get_console_logs": return GetConsoleLogs(request.limit, request.clear);
            case "unity_project_status": return ProjectStatus(request.log_limit);
            case "unity_add_component": return AddComponent(request);
            case "unity_remove_component": return RemoveComponent(request);
            case "unity_duplicate_gameobject": return DuplicateGameObject(request);
            case "unity_delete_gameobject": return DeleteGameObject(request);
            case "unity_move_gameobject": return MoveGameObject(request);
            case "unity_instantiate_prefab": return InstantiatePrefab(request);
            case "unity_assign_material": return AssignMaterial(request);
            case "unity_get_animator_info": return GetAnimatorInfo(request);
            case "unity_set_animator_parameter": return SetAnimatorParameter(request);
            default: return Error("지원하지 않는 Unity Editor 작업입니다.");
        }
    }

    private static Response OpenScene(string scene)
    {
        var projectRoot = Directory.GetParent(Application.dataPath).FullName;
        if (string.IsNullOrEmpty(scene) || Path.IsPathRooted(scene) || scene.Contains("..") || !scene.EndsWith(".unity", StringComparison.OrdinalIgnoreCase)) return Error("프로젝트 안의 .unity 상대 경로가 필요합니다.");
        var full = Path.GetFullPath(Path.Combine(projectRoot, scene));
        if (!full.StartsWith(projectRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(full)) return Error("씬 파일을 찾을 수 없습니다.");
        var opened = EditorSceneManager.OpenScene(full, OpenSceneMode.Single);
        return new Response { ok = true, scene = opened.path };
    }

    private static Response FindGameObjects(string query)
    {
        var items = Resources.FindObjectsOfTypeAll<GameObject>().Where(go => go.scene.IsValid() && !EditorUtility.IsPersistent(go) && (string.IsNullOrEmpty(query) || go.name.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0 || HierarchyPath(go.transform).IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0)).Take(200).Select(go => new GameObjectInfo { id = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(), name = go.name, path = HierarchyPath(go.transform), active = go.activeSelf }).ToArray();
        return new Response { ok = true, game_objects = items };
    }

    private static GameObject ResolveGameObject(string id)
    {
        if (!GlobalObjectId.TryParse(id, out var globalId)) return null;
        return GlobalObjectId.GlobalObjectIdentifierToObjectSlow(globalId) as GameObject;
    }

    private static Type ResolveComponentType(string name)
    {
        return TypeCache.GetTypesDerivedFrom<Component>().FirstOrDefault(type => type.FullName == name || type.Name == name);
    }

    private static Response GetComponent(Request request)
    {
        var gameObject = ResolveGameObject(request.game_object_id);if (gameObject == null) return Error("GameObject를 찾을 수 없습니다.");
        var type = ResolveComponentType(request.component_type);if (type == null) return Error("허용된 Component 형식을 찾을 수 없습니다.");
        var component = gameObject.GetComponent(type);if (component == null) return Error("해당 GameObject에 Component가 없습니다.");
        return new Response { ok = true, component = new ComponentInfo { type = type.FullName, json = EditorJsonUtility.ToJson(component, true) } };
    }

    private static Response SetComponent(Request request)
    {
        var gameObject = ResolveGameObject(request.game_object_id);if (gameObject == null) return Error("GameObject를 찾을 수 없습니다.");
        var type = ResolveComponentType(request.component_type);if (type == null) return Error("허용된 Component 형식을 찾을 수 없습니다.");
        var component = gameObject.GetComponent(type);if (component == null) return Error("해당 GameObject에 Component가 없습니다.");
        var serialized = new SerializedObject(component);var property = serialized.FindProperty(request.property);if (property == null) return Error("직렬화된 속성을 찾을 수 없습니다.");
        if (!Assign(property, request.value)) return Error("지원하지 않는 속성 형식입니다. string, bool, int, float만 지원합니다.");
        serialized.ApplyModifiedProperties();EditorUtility.SetDirty(component);return new Response { ok = true, game_object_id = request.game_object_id, property = request.property };
    }

    private static bool Assign(SerializedProperty property, string value)
    {
        switch (property.propertyType)
        {
            case SerializedPropertyType.String: property.stringValue = value ?? ""; return true;
            case SerializedPropertyType.Boolean: if (bool.TryParse(value, out var boolean)) { property.boolValue = boolean; return true; } return false;
            case SerializedPropertyType.Integer: if (long.TryParse(value, out var integer)) { property.longValue = integer; return true; } return false;
            case SerializedPropertyType.Float: if (float.TryParse(value, out var floating)) { property.floatValue = floating; return true; } return false;
            default: return false;
        }
    }

    private static Response CreateGameObject(Request request)
    {
        if (string.IsNullOrWhiteSpace(request.name)) return Error("GameObject 이름이 필요합니다.");
        GameObject parent = null;if (!string.IsNullOrEmpty(request.parent_id)) { parent = ResolveGameObject(request.parent_id);if (parent == null) return Error("부모 GameObject를 찾을 수 없습니다."); }
        var gameObject = new GameObject(request.name.Trim());Undo.RegisterCreatedObjectUndo(gameObject, "School Code Create GameObject");
        if (parent != null) gameObject.transform.SetParent(parent.transform, false);
        Selection.activeGameObject = gameObject;return new Response { ok = true, game_object_id = GlobalObjectId.GetGlobalObjectIdSlow(gameObject).ToString() };
    }

    private static int CaptureWidth(Request request, int fallback) { return Mathf.Clamp(request.max_width > 0 ? request.max_width : fallback, 320, 1920); }
    private static int CaptureHeight(Request request, int fallback) { return Mathf.Clamp(request.max_height > 0 ? request.max_height : fallback, 240, 1080); }

    private static Response CaptureScene(Request request)
    {
        var view = SceneView.lastActiveSceneView;
        if (view == null || view.camera == null) return Error("활성 Scene 뷰를 찾을 수 없습니다. Unity Scene 탭을 먼저 여세요.");
        return CaptureCamera(view.camera, CaptureWidth(request, 1280), CaptureHeight(request, 720));
    }

    private static Response CaptureGame(Request request)
    {
        var width = CaptureWidth(request, 1280); var height = CaptureHeight(request, 720);
        if (Application.isPlaying)
        {
            try
            {
                var screenshot = ScreenCapture.CaptureScreenshotAsTexture();
                if (screenshot != null) return EncodeTexture(screenshot, width, height, true);
            }
            catch { }
        }
        var camera = Camera.main;
        if (camera == null) camera = Camera.allCameras.FirstOrDefault(item => item != null && item.enabled);
        if (camera == null) return Error("Game 뷰를 캡처할 카메라를 찾을 수 없습니다.");
        return CaptureCamera(camera, width, height);
    }

    private static Response CaptureCamera(Camera camera, int width, int height)
    {
        var previous = camera.targetTexture; var render = RenderTexture.GetTemporary(width, height, 24, RenderTextureFormat.ARGB32);
        try
        {
            camera.targetTexture = render; camera.Render(); var old = RenderTexture.active; RenderTexture.active = render;
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false); texture.ReadPixels(new Rect(0, 0, width, height), 0, 0); texture.Apply(); RenderTexture.active = old;
            return EncodeTexture(texture, width, height, true);
        }
        finally { camera.targetTexture = previous; RenderTexture.ReleaseTemporary(render); }
    }

    private static Response EncodeTexture(Texture2D source, int maxWidth, int maxHeight, bool destroySource)
    {
        Texture2D current = source; var ownsCurrent = destroySource; try
        {
            var scale = Mathf.Min(1f, Mathf.Min((float)maxWidth / Mathf.Max(1, source.width), (float)maxHeight / Mathf.Max(1, source.height)));
            if (scale < 0.999f) { current = ResizeTexture(source, Mathf.Max(1, Mathf.RoundToInt(source.width * scale)), Mathf.Max(1, Mathf.RoundToInt(source.height * scale))); if (ownsCurrent) UnityEngine.Object.DestroyImmediate(source); ownsCurrent = true; }
            var bytes = current.EncodeToPNG();
            while (bytes.Length > 8 * 1024 * 1024 && current.width > 256 && current.height > 256)
            {
                var resized = ResizeTexture(current, Mathf.Max(256, current.width / 2), Mathf.Max(256, current.height / 2)); if (ownsCurrent) UnityEngine.Object.DestroyImmediate(current); current = resized; ownsCurrent = true; bytes = current.EncodeToPNG();
            }
            return new Response { ok = true, mime = "image/png", image_base64 = Convert.ToBase64String(bytes), width = current.width, height = current.height };
        }
        finally { if (ownsCurrent && current != null) UnityEngine.Object.DestroyImmediate(current); }
    }

    private static Texture2D ResizeTexture(Texture2D source, int width, int height)
    {
        var render = RenderTexture.GetTemporary(width, height, 0, RenderTextureFormat.ARGB32); var old = RenderTexture.active;
        Graphics.Blit(source, render); RenderTexture.active = render; var output = new Texture2D(width, height, TextureFormat.RGBA32, false); output.ReadPixels(new Rect(0, 0, width, height), 0, 0); output.Apply(); RenderTexture.active = old; RenderTexture.ReleaseTemporary(render); return output;
    }

    private static Response ModelPreview(Request request)
    {
        var assetPath = request.path;
        if (string.IsNullOrEmpty(assetPath)) return Error("모델 에셋 경로가 필요합니다.");
        if (!assetPath.Replace('\\', '/').StartsWith("Assets/", StringComparison.OrdinalIgnoreCase) || assetPath.Contains("..")) return Error("Assets 아래의 상대 경로만 허용됩니다.");
        var asset = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(assetPath); if (asset == null) return Error("모델 에셋을 찾을 수 없습니다.");
        var preview = AssetPreview.GetAssetPreview(asset) ?? AssetPreview.GetMiniThumbnail(asset); if (preview == null) return Error("Unity가 아직 모델 미리보기를 만들지 못했습니다. 잠시 후 다시 요청하세요.");
        return EncodeTexture(preview, Mathf.Clamp(request.max_width > 0 ? request.max_width : 512, 128, 1024), Mathf.Clamp(request.max_height > 0 ? request.max_height : 512, 128, 1024), false);
    }

    private static Response Play() { EditorApplication.isPlaying = true; return EditorState(); }
    private static Response Pause(bool paused) { if (!EditorApplication.isPlaying) return Error("Unity가 Play Mode가 아닙니다."); EditorApplication.isPaused = paused; return EditorState(); }
    private static Response StopPlayMode() { EditorApplication.isPlaying = false; EditorApplication.isPaused = false; return EditorState(); }
    private static Response EditorState() { return new Response { ok = true, is_playing = EditorApplication.isPlaying, is_paused = EditorApplication.isPaused }; }

    private static Response GetConsoleLogs(int limit, bool clear)
    {
        limit = Mathf.Clamp(limit > 0 ? limit : 50, 1, 200); LogInfo[] result; lock (LogLock) { result = Logs.Skip(Mathf.Max(0, Logs.Count - limit)).ToArray(); if (clear) Logs.Clear(); }
        return new Response { ok = true, logs = result };
    }

    private static Response ProjectStatus(int logLimit)
    {
        var logs = GetConsoleLogs(logLimit, false).logs; return new Response { ok = true, active_scene = SceneManager.GetActiveScene().path, is_playing = EditorApplication.isPlaying, is_paused = EditorApplication.isPaused, is_compiling = EditorApplication.isCompiling, is_updating = EditorApplication.isUpdating, build_target = EditorUserBuildSettings.activeBuildTarget.ToString(), build_scenes = EditorBuildSettings.scenes.Where(item => item != null && item.enabled).Select(item => item.path).ToArray(), logs = logs, scene = SceneManager.GetActiveScene().name };
    }

    private static Response AddComponent(Request request)
    {
        var gameObject = ResolveGameObject(request.game_object_id); if (gameObject == null) return Error("GameObject를 찾을 수 없습니다."); var type = ResolveComponentType(request.component_type); if (type == null || !typeof(Component).IsAssignableFrom(type)) return Error("추가할 Component 형식을 찾을 수 없습니다."); var component = Undo.AddComponent(gameObject, type); return component == null ? Error("Component를 추가하지 못했습니다.") : new Response { ok = true, game_object_id = request.game_object_id, property = type.FullName };
    }

    private static Response RemoveComponent(Request request)
    {
        var gameObject = ResolveGameObject(request.game_object_id); if (gameObject == null) return Error("GameObject를 찾을 수 없습니다."); var type = ResolveComponentType(request.component_type); if (type == null || type == typeof(Transform)) return Error("Transform은 삭제할 수 없습니다."); var component = gameObject.GetComponent(type); if (component == null) return Error("해당 Component가 없습니다."); Undo.DestroyObjectImmediate(component); return new Response { ok = true, game_object_id = request.game_object_id, property = type.FullName };
    }

    private static Response DuplicateGameObject(Request request)
    {
        var original = ResolveGameObject(request.game_object_id); if (original == null) return Error("GameObject를 찾을 수 없습니다."); var clone = UnityEngine.Object.Instantiate(original, original.transform.parent); clone.name = original.name + " Copy"; Undo.RegisterCreatedObjectUndo(clone, "School Code Duplicate GameObject"); Selection.activeGameObject = clone; return new Response { ok = true, game_object_id = GlobalObjectId.GetGlobalObjectIdSlow(clone).ToString() };
    }

    private static Response DeleteGameObject(Request request)
    {
        var gameObject = ResolveGameObject(request.game_object_id); if (gameObject == null) return Error("GameObject를 찾을 수 없습니다."); Undo.DestroyObjectImmediate(gameObject); return new Response { ok = true, game_object_id = request.game_object_id };
    }

    private static Response MoveGameObject(Request request)
    {
        var gameObject = ResolveGameObject(request.game_object_id); if (gameObject == null) return Error("GameObject를 찾을 수 없습니다."); Undo.RecordObject(gameObject.transform, "School Code Set Transform"); if (request.position != null) gameObject.transform.localPosition = request.position.ToVector3(); if (request.rotation != null) gameObject.transform.localEulerAngles = request.rotation.ToVector3(); if (request.scale != null) gameObject.transform.localScale = request.scale.ToVector3(); EditorUtility.SetDirty(gameObject); return new Response { ok = true, game_object_id = request.game_object_id };
    }

    private static Response InstantiatePrefab(Request request)
    {
        var prefabPath = (request.prefab_path ?? "").Replace('\\', '/'); if (!prefabPath.StartsWith("Assets/", StringComparison.OrdinalIgnoreCase) || prefabPath.Contains("..") || !prefabPath.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase)) return Error("Assets 아래의 .prefab 상대 경로가 필요합니다."); var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath); if (prefab == null) return Error("Prefab을 찾을 수 없습니다."); var instance = PrefabUtility.InstantiatePrefab(prefab) as GameObject; if (instance == null) return Error("Prefab을 생성하지 못했습니다."); if (!string.IsNullOrEmpty(request.parent_id)) { var parent = ResolveGameObject(request.parent_id); if (parent == null) { Undo.DestroyObjectImmediate(instance); return Error("부모 GameObject를 찾을 수 없습니다."); } instance.transform.SetParent(parent.transform, false); } if (request.position != null) instance.transform.localPosition = request.position.ToVector3(); Undo.RegisterCreatedObjectUndo(instance, "School Code Instantiate Prefab"); Selection.activeGameObject = instance; return new Response { ok = true, game_object_id = GlobalObjectId.GetGlobalObjectIdSlow(instance).ToString() };
    }

    private static Response AssignMaterial(Request request)
    {
        var gameObject = ResolveGameObject(request.game_object_id); if (gameObject == null) return Error("GameObject를 찾을 수 없습니다."); var renderer = gameObject.GetComponent<Renderer>(); if (renderer == null) return Error("Renderer가 없습니다."); var material = AssetDatabase.LoadAssetAtPath<Material>((request.material_path ?? "").Replace('\\', '/')); if (material == null) return Error("Material 에셋을 찾을 수 없습니다."); var materials = renderer.sharedMaterials; if (request.slot < 0 || request.slot >= materials.Length) return Error("Material 슬롯이 없습니다."); Undo.RecordObject(renderer, "School Code Assign Material"); materials[request.slot] = material; renderer.sharedMaterials = materials; EditorUtility.SetDirty(renderer); return new Response { ok = true, game_object_id = request.game_object_id, property = request.material_path };
    }

    private static Response GetAnimatorInfo(Request request)
    {
        var gameObject = ResolveGameObject(request.game_object_id); if (gameObject == null) return Error("GameObject를 찾을 수 없습니다."); var animator = gameObject.GetComponent<Animator>(); if (animator == null || animator.runtimeAnimatorController == null) return Error("Animator Controller가 없습니다."); var parameters = animator.parameters.Select(item => new AnimatorParameterInfo { name = item.name, type = item.type.ToString(), default_float = item.defaultFloat, default_int = item.defaultInt, default_bool = item.defaultBool }).ToArray(); return new Response { ok = true, game_object_id = request.game_object_id, animator_controller = animator.runtimeAnimatorController.name, animator_parameters = parameters };
    }

    private static Response SetAnimatorParameter(Request request)
    {
        var gameObject = ResolveGameObject(request.game_object_id); if (gameObject == null) return Error("GameObject를 찾을 수 없습니다."); var animator = gameObject.GetComponent<Animator>(); if (animator == null) return Error("Animator가 없습니다."); var type = (request.parameter_type ?? "").ToLowerInvariant(); try { if (type == "float") animator.SetFloat(request.name, float.Parse(request.value, System.Globalization.CultureInfo.InvariantCulture)); else if (type == "int") animator.SetInteger(request.name, int.Parse(request.value, System.Globalization.CultureInfo.InvariantCulture)); else if (type == "bool") animator.SetBool(request.name, bool.Parse(request.value)); else if (type == "trigger") animator.SetTrigger(request.name); else return Error("Animator parameter_type은 float, int, bool, trigger 중 하나여야 합니다."); return new Response { ok = true, game_object_id = request.game_object_id, property = request.name }; } catch (Exception e) { return Error(e.Message); }
    }

    private static Response SaveScene() { EditorSceneManager.SaveOpenScenes();return new Response { ok = true, scene = SceneManager.GetActiveScene().path }; }
    private static string HierarchyPath(Transform transform) { var names = new List<string>();while (transform != null) { names.Add(transform.name);transform = transform.parent; }names.Reverse();return string.Join("/", names); }
    private static Response Error(string message) { return new Response { ok = false, error = (message ?? "오류").Substring(0, Math.Min(500, (message ?? "오류").Length)) }; }
}
#endif
