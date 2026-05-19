'use client'
import { useEffect, useRef, Suspense, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

type Emojifeedback = 'smile' | 'think' | 'confused' | 'no_reaction' | 'nod'


type Props = {
  feedback: Emojifeedback
}

type MeshRefs = {//各オブジェクトの参照を定義
  mouth: THREE.Mesh | null
  hand: THREE.Mesh | null
  eye: THREE.Mesh | null
  head: THREE.Mesh | null
  eyebrow: THREE.Mesh | null
}

function Model({ feedback }: Props) {
  const { scene } = useGLTF('/Emoji3D-model.glb')//モデルの読み込み
  const meshes = useRef<MeshRefs>({ mouth: null, hand: null, eye: null, head: null, eyebrow: null })


  const setMorphTarget = (mesh: THREE.Mesh | null, index: number, value: number) => {//シェイプキーを瞬間的に動かす関数
    if (mesh?.morphTargetInfluences) {//nullチェックと処理
      mesh.morphTargetInfluences[index] = value
    }
  }

  useEffect(() => {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.name === "口001") {
          meshes.current.mouth = object
        }
        if (object.name === "球005") {//頭
          meshes.current.head = object
        }
        if (object.name === "球005_1") {//目
          meshes.current.eye = object
        }
        if (object.name === "球005_2") {//眉毛
          meshes.current.eyebrow = object
        }
        if (object.name === "手") {
          meshes.current.hand = object
        }
      }
      if (object instanceof THREE.Mesh) {//コンソールにオブジェクト名とシェイプキー番号を出力する
        console.log(object.name, object.morphTargetDictionary)
        console.log(meshes.current.mouth)
      }
    });
  }, [scene])

  //滑らかな表情遷移のため、各シェイプキーの初期値を0にする
  const targetMorphs = useRef<Record<string, number>>({
    'eye_con_right': 0,
    'eye_con_left': 0,
    'eye_no_reaction_right': 0,
    'eye_no_reaction_left': 0,
    'eye_think': 0,
    'eyebrow_think': 0,
    'head_nod': 0,
    'mouth_nod': 0,
    'eye_nod': 0,
    'mouth_smile': 0,
    'mouth_con': 0,
    'mouth_think': 0,
    'mouth_hide': 0,
    'hand_think': 0
  })

  useEffect(() => {

    function resetMorphs() {//シェイプキーを対象に値を0にリセットする
      Object.keys(targetMorphs.current).forEach(key => {
        targetMorphs.current[key] = 0
        targetMorphs.current.mouth_nod = 0
      })
    }

    resetMorphs()//リセット
    switch (feedback) {//各変化パターンごとに目標値の設定
      case 'smile':
        targetMorphs.current.mouth_smile = 1
        break;
      case 'think':
        targetMorphs.current.mouth_think = 1
        targetMorphs.current.hand_think = 1
        targetMorphs.current.eye_think = 1
        targetMorphs.current.eyebrow_think = 1
        break;
      case 'confused':
        targetMorphs.current.mouth_con = 1
        targetMorphs.current.eye_con_right = 0.75
        targetMorphs.current.eye_con_left = 0.75
        break;
      case 'no_reaction':
        targetMorphs.current.eye_no_reaction_right = 0.9
        targetMorphs.current.eye_no_reaction_left = 0.9
        break;
      case 'nod':
        targetMorphs.current.head_nod = 1//頷きは目だった
        targetMorphs.current.mouth_nod = 1
        targetMorphs.current.eye_nod = 1

        setTimeout(() => {//二度頭を下げたい
          resetMorphs()
          targetMorphs.current.mouth_smile = 1
        }, 600);

        setTimeout(() => {
          targetMorphs.current.head_nod = 1
          targetMorphs.current.mouth_nod = 1
          targetMorphs.current.eye_nod = 1
        }, 1200); 
        
         setTimeout(() => {//二度頭を下げたい
          resetMorphs()
          targetMorphs.current.mouth_smile = 1
        }, 1800);
        break;
    }
  }, [feedback]);//依存関係にプロパティを追加することでプロパティの変化を監視


  type MorphTarget = {
    mesh: THREE.Mesh | null,
    index: number,
    speed: number
  }

  useFrame(() => {
    const methTargetMorphs: Record<string, MorphTarget> = {
      eye_con_right: { mesh: meshes.current.eye, index: 1, speed: 0.03 },
      eye_con_left: { mesh: meshes.current.eye, index: 3, speed: 0.03 },
      eye_no_reaction_right: { mesh: meshes.current.eye, index: 4, speed: 0.03 },
      eye_no_reaction_left: { mesh: meshes.current.eye, index: 2, speed: 0.03 },
      eye_think: { mesh: meshes.current.eye, index: 5, speed: 0.03 },
      eyebrow_think: { mesh: meshes.current.eyebrow, index: 6, speed: 0.1 },
      head_nod: { mesh: meshes.current.head, index: 0, speed: 0.06 },
      mouth_nod: { mesh: meshes.current.mouth, index: 0, speed: 0.02 },
      eye_nod: { mesh: meshes.current.eye, index: 0, speed: 0.03 },
      mouth_smile: { mesh: meshes.current.mouth, index: 1, speed: 0.03 },
      mouth_con: { mesh: meshes.current.mouth, index: 2, speed: 0.03 },
      mouth_think: { mesh: meshes.current.mouth, index: 3, speed: 0.03 },
      mouth_hide: { mesh: meshes.current.mouth, index: 4, speed: 0.03 },
      hand_think: { mesh: meshes.current.hand, index: 0, speed: 0.05 },
    }

    Object.entries(methTargetMorphs).forEach(([key, { mesh, index, speed }]) => {
      if (mesh?.morphTargetInfluences) {
        mesh.morphTargetInfluences[index] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[index], targetMorphs.current[key], speed || 1)
      }
    })
  })

  return <primitive object={scene} scale={1} position={[0, -0.28, 0]} />

}

function Emoji3D() {
  const feedbacks = ['smile', 'think', 'confused', 'no_reaction', 'nod'] as Emojifeedback[]
  const [current, setcurrent] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setcurrent((prev) => (prev + 1) % feedbacks.length)
    }, 3000);
    return () => clearInterval(id)
  })

  return (
    <Canvas camera={{ position: [0, 0, 10], fov: 27 }}
      style={{ width: '100%', height: '100%' }}>
      <ambientLight intensity={1} />
      <directionalLight position={[20, 20, 20]} intensity={2} />
      <Suspense fallback={null}>
        <Model feedback="think" />
      </Suspense>
    </Canvas>
  )
}

export default Emoji3D;
