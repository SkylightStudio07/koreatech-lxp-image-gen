const DEFAULT_PORT=18777;
const ACTIONS=new Set(['unity_open_scene','unity_find_gameobjects','unity_get_component','unity_set_component','unity_create_gameobject','unity_save_scene','unity_capture_scene','unity_capture_game','unity_model_preview','unity_play','unity_pause','unity_stop','unity_get_console_logs','unity_project_status','unity_add_component','unity_remove_component','unity_duplicate_gameobject','unity_delete_gameobject','unity_move_gameobject','unity_instantiate_prefab','unity_assign_material','unity_get_animator_info','unity_set_animator_parameter']);

function editorPort(value=DEFAULT_PORT){const port=Number(value);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Unity Editor 브리지 포트가 올바르지 않습니다.');return port;}

class UnityEditorClient{
  constructor({getToken,getPort=()=>DEFAULT_PORT,fetchImpl=globalThis.fetch}={}){this.getToken=getToken;this.getPort=getPort;this.fetch=fetchImpl;}
  async call(action,args={}){
    if(!ACTIONS.has(action))throw Error('지원하지 않는 Unity Editor 도구입니다.');
    const token=await this.getToken?.();if(!token)throw Error('Unity Editor 브리지 토큰이 설정되지 않았습니다. VS Code에서 Unity Editor 연결 설정을 실행하세요.');
    const port=editorPort(await this.getPort?.());
    const response=await this.fetch(`http://127.0.0.1:${port}/mcp`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...args}),redirect:'error',signal:AbortSignal.timeout(30000)});
    const text=await response.text();let data={};try{data=text?JSON.parse(text):{};}catch{throw Error('Unity Editor 브리지 응답을 해석할 수 없습니다.');}
    if(!response.ok||data.error)throw Error(String(data.error||`Unity Editor 브리지 HTTP ${response.status}`).slice(0,500));
    return data;
  }
}

module.exports={UnityEditorClient,editorPort,ACTIONS,DEFAULT_PORT};
