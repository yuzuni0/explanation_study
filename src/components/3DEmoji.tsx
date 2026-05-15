'use client'
import { useEffect, useRef, Suspense } from 'react'
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

  const setMorphTarget = (mesh: THREE.Mesh | null, index: number, value: number) => {//caseをスッキリさせるための関数を定義
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
        if (object.name === "球005") {//多分 頭
          meshes.current.head = object
        }
        if (object.name === "球005_1") {//多分 目
          meshes.current.eye = object
        }
        if (object.name === "球005_2") {//多分 眉毛
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

  useEffect(() => {
    switch (feedback) {//各変化パターンごとに
      case 'smile':
        setMorphTarget(meshes.current.mouth, 1, 1)//メッシュ名、シェイプキー番号、動かす具合
        break;
      case 'think':
        setMorphTarget(meshes.current.mouth, 3, 1)
        setMorphTarget(meshes.current.hand, 0, 1)
        setMorphTarget(meshes.current.eye, 5, 1)
        setMorphTarget(meshes.current.eyebrow, 6, 1)
        break;
      case 'confused':
        setMorphTarget(meshes.current.mouth, 2, 1)
        setMorphTarget(meshes.current.eye,3,0.75)
        setMorphTarget(meshes.current.eye,1,0.75)
        break;
      case 'no_reaction':
        setMorphTarget(meshes.current.eye, 2, 0.9)
        setMorphTarget(meshes.current.eye, 4, 0.9)
        break;

      case 'nod':
        setMorphTarget(meshes.current.eye,0,1)//頷きは目だった
        setMorphTarget(meshes.current.mouth,0,1)
        break;
    }
  }, [feedback]);//依存関係にプロパティを追加することでプロパティの変化を監視

  return <primitive object={scene} scale={1} position={[0, 0, 0]} />
}

function Emoji3D() {
  return (
    <Canvas camera={{ position: [0, 0, 10], fov: 50 }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={1} />
      <directionalLight position={[20, 20, 20]} intensity={1} />
      <Suspense fallback={null}>
        <Model feedback="smile" />
      </Suspense>
    </Canvas>
  )
}

export default Emoji3D;
