import { Tile } from '../tile/tile'
import { OBB } from '../geometry/obb'
import { Box3,
  Vector3,
  DoubleSide,
  Sphere,
  Mesh,
  BufferGeometry,
  BufferAttribute,
  ImageBitmapLoader,
  Texture,
  MeshBasicMaterial,
  // TextureLoader,
  CanvasTexture
} from 'three'
import { dirname, isAbsolute, sep } from '@core/utils/path'
// import { path } from 'browserify'
// var path = require('path')

const getDirname = (url) => {
  const i = url.lastIndexOf('=')
  if (i !== -1) {
    return url.substring(0, i + 1)
  } else {
    return dirname(url) + sep
  }
}

function Loader (meshCallback) {
  var rootJson = null
  var self = this
  this.meshCallback = meshCallback

  function load (url, signal) {
    if (!url.endsWith('b3dm') && !url.endsWith('json')) {
      throw new Error('unsupported format : ' + url)
    }
    // debugger
    return fetch(url, signal ? { signal: signal } : {}).then(result => {
      if (!result.ok) {
        throw new Error(`couldn't load "${ url }". Request failed with status ${ result.status } : ${ result.statusText }`)
      }
      if (url.endsWith('b3dm')) {
        return result.arrayBuffer().then(buffer => {
          return parseB3DM2(buffer, url)
        }).catch(error => {
          console.log(error)
        })
      } else if (url.endsWith('json')) {
        return result.json().then((json) => {
          if (!rootJson) {
            rootJson = json
          }
          return parseTileset(json.root, getDirname(url))
        })
      }
    }).catch(error => {
      return Promise.reject(error)
    })
  }

  function parseTileset (tileset, rootPath) {
    var tile = new Tile(load)
    // debugger
    console.assert(tileset.geometricError !== 'undefined')
    tile.setGeometricError(tileset.geometricError)
    if (tileset.content) {
      if (tileset.content.uri) {
        if (isAbsolute(tileset.content.uri)) {
          tile.setContent(tileset.content.uri)
        } else {
          tile.setContent(rootPath + tileset.content.uri)
        }
      } else if (tileset.content.url) {
        if (isAbsolute(tileset.content.url)) {
          tile.setContent(tileset.content.url)
        } else {
          tile.setContent(rootPath + tileset.content.url)
        }
      }
    }

    if (tileset.boundingVolume) {
      if (tileset.boundingVolume.box) {
        tile.setVolume(new OBB(tileset.boundingVolume.box), 'box')
      } else if (tileset.boundingVolume.region) {
        const region = tileset.boundingVolume.region
        tile.setVolume(new Box3(new Vector3(region[0], region[2], region[4]), new Vector3(region[1], region[3], region[5])), 'region')
      } else if (tileset.boundingVolume.sphere) {
        const sphere = tileset.boundingVolume.sphere
        tile.setVolume(new Sphere(new Vector3(sphere[0], sphere[1], sphere[2]), sphere[3]), 'sphere')
      }
    }

    tile.setRefine(tileset.refine ? tileset.refine : 'REPLACE')

    if (tileset.children) {
      tileset.children.forEach(element => {
        tile.addChild(parseTileset(element, rootPath))
      })
    }

    return tile
  }
  function createMeshObject (vertices, indices, uv, faceGroup, textures) {
    // const vertices = this.#vertices
    // const uv = this.#uv
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(vertices, 3))
    geometry.setAttribute('uv', new BufferAttribute(uv, 2))
    geometry.setIndex(new BufferAttribute(indices, 1))
    // geometry.computeBoundingSphere()
    geometry.clearGroups()
    const indicesGroup = []
    // const faceGroup = this.#faceGroup
    for (let i = 0, l = faceGroup.length; i < l; i++) {
      const tmp = indices.slice(...faceGroup[i])
      indicesGroup.push(tmp)
      const face = faceGroup[i]
      geometry.addGroup(face[0] * 3, (face[1] - face[0] + 1) * 3, i)
    }
    const materialArr = []
    const textureLoadings = []
    const loader = new ImageBitmapLoader()
    loader.setOptions({ imageOrientation: 'flipY' })
    for (let i = 0, l = textures.length; i < l; i++) {
      const textureName = textures[i]
      const textureURL = textureName
      let texture = new Texture()
      const material = new MeshBasicMaterial()
      const promise = new Promise(resolve => {
        loader.load(textureURL, (data) => {
          texture = new CanvasTexture(data)
          texture.imageUrl = textureURL
          material.map = texture
          materialArr.push(material)
          resolve(texture)
        })
      })

      textureLoadings.push(promise)
    }

    return new Promise((resolve, reject) => {
      Promise.all(textureLoadings).then(() => {
        resolve({ geometry, materialArr })
      })
    })
  }

  /** ???typedArray??????????????? */
  function getStringFromTypedArray (uint8Array, byteOffset, byteLength) {
  // >>includeStart('debug', pragmas.debug);
    if (!uint8Array) {
      throw new Error('uint8Array is required.')
    }
    if (byteOffset < 0) {
      throw new Error('byteOffset cannot be negative.')
    }
    if (byteLength < 0) {
      throw new Error('byteLength cannot be negative.')
    }
    if (byteOffset + byteLength > uint8Array.byteLength) {
      throw new Error('sub-region exceeds array bounds.')
    }
    // >>includeEnd('debug');

    byteOffset = byteOffset || 0
    byteLength = byteLength || uint8Array.byteLength - byteOffset
    uint8Array = uint8Array.subarray(byteOffset, byteOffset + byteLength)
    let result = ''
    if (window.TextDecoder) {
      const decoder = new TextDecoder('utf-8')
      result = decoder.decode(uint8Array)
    } else {
    // ????????????String.fromCharCode.call???????????????????????????
      for (var i = 0; i < byteLength; i++) {
        result += String.fromCharCode(uint8Array[i])
      }
    }
    return result
  }
  // ???????????????/??????;??????TypedArray????????????,??????,uv
  function parseB3DM2 (arrayBuffer, url) {
    const WEBGL_SHORT = 5123
    const buffer = arrayBuffer
    let ptStr, uvStr, idxStr, materStr
    let indexComponentSize, emissStr
    let _groupCount = 0 // ????????????
    // let _hasNormal = false //???????????????
    let _hasTextur = false // ???????????????
    // let _vArr = [] //?????????
    // let _vtArr = [] //????????????
    // let _vnArr = [] // ????????????
    // let _faceArr = [] //??????????????????????????????,0????????????,1???????????????,2???????????????
    const _fgArr = [] // ????????????????????????????????????????????????2
    // let _indices = [] //?????????
    const _groupArr = [] // ?????????
    // let _mtlUsed = [] // ??????????????????????????????
    // let _materials = [] // ???????????????????????????
    const _textures = [] // ??????????????????????????????
    // let _vertices = []
    let index = 0
    const dataView = new DataView(buffer)
    // debugger
    // 4 bytes
    // const magic =
    //   String.fromCharCode(dataView.getUint8(0)) +
    //   String.fromCharCode(dataView.getUint8(1)) +
    //   String.fromCharCode(dataView.getUint8(2)) +
    //   String.fromCharCode(dataView.getUint8(3))

    const version = dataView.getUint32(4, true)
    console.assert(version === 1)

    // const len1 = dataView.getInt32(32, true)
    const len2 = dataView.getInt32(36, true)
    const dataBuffer = buffer.slice(44, 44 + len2)
    const jsonString = getStringFromTypedArray(new Uint8Array(dataBuffer))
    const gModel = JSON.parse(jsonString)
    // console.log(gModel)
    const vertexCount = gModel.bufferViews.bufferView_vertex.byteLength / 4 / 5

    // ?????????????????????
    const meshes = gModel.meshes['mesh_model'].primitives
    // const meshes = JSON.parse(v1.toString())

    for (let i = 0, l = meshes.length; i < l; i++) {
      if (meshes[i].attributes) {
        const attr = meshes[i].attributes
        if (attr.POSITION) {
          ptStr = attr.POSITION
        }
        if (attr.TEXCOORD_0) {
          _hasTextur = true
          uvStr = attr.TEXCOORD_0.toString()
        }
      }
      if (meshes[i].indices) {
        idxStr = meshes[i].indices.toString()
      }
      if (meshes[i].material) {
        materStr = meshes[i].material.toString()
      }

      const accessor1 = gModel.accessors[idxStr]
      if (accessor1.componentType === WEBGL_SHORT) {
        indexComponentSize = 2
      } else {
        indexComponentSize = 4
      }

      // ????????????
      if (materStr) {
        const material = gModel.materials[materStr]
        emissStr = material.values.emission
      }

      // ??????
      if (emissStr) {
        const textures = gModel.textures[emissStr]
        const t = textures.source
        const images = gModel.images[t]
        _textures[index] = getDirname(url) + images.uri
      }

      for (let i = 0; i < accessor1.count / 3; i++) {
        _groupArr.push(index)
      }

      index++
      _groupCount++
    }

    // ????????????
    const indexLen = gModel.bufferViews.bufferView_index.byteLength / indexComponentSize
    const indexGltf = buffer.slice(44 + len2, 44 + len2 + indexLen * indexComponentSize)

    let indicesBuffer = []
    if (indexComponentSize === 2) {
      indicesBuffer = new Uint16Array(indexGltf)
    } else {
      indicesBuffer = new Uint32Array(indexGltf)
    }

    // ?????????
    let offset_position = 0
    let accessor_position = gModel.accessors[ptStr]
    if (!accessor_position) accessor_position = { byteOffset: 0 }
    const bufferVertex = gModel.bufferViews.bufferView_vertex
    // const vertexUV = []
    offset_position = 44 + len2 + bufferVertex.byteOffset + accessor_position.byteOffset

    const verticesBuffer = new Float32Array(buffer.slice(offset_position, offset_position + vertexCount * 12))

    // uv??????
    let offset_uv = 0
    let accessor_uv = gModel.accessors[uvStr]
    if (!accessor_uv) accessor_uv = { byteOffset: 0 }
    offset_uv = 44 + len2 + bufferVertex.byteOffset + accessor_uv.byteOffset
    const uvBuffer = new Float32Array(buffer.slice(offset_uv, offset_uv + vertexCount * 8))
    for (let i = 0, l = uvBuffer.length; i < l; i += 2) {
      // v???????????????1-v?????????three????????????
      uvBuffer[i + 1] = 1 - uvBuffer[i + 1]
    }

    // face group
    let count = 0
    let j = 0
    for (let i = 0; i < _groupCount; i++) {
      const arrenge = [count, count]
      for (; j < _groupArr.length; j = count) {
        if (_groupArr[j] === i) {
          ++count
          ++arrenge[1]
        } else break
      }
      arrenge[1] -= 1
      _fgArr.push(arrenge)
    }
    // debugger
    const result = {
      vertices: verticesBuffer,
      uv: uvBuffer,
      indices: indicesBuffer,
      textures: _textures,
      faceGroup: _fgArr
    }
    // console.log(result)
    // this.object3D.name = 'b3dm'
    // ????????????????????????????????????(??????this.object3D?????????Mesh??????,??????????????????geometry??????,)???????????????gc,???????????????TilesetUnit??????hide????????????????????????)
    // return new Promise((resolve, reject) => {
    //
    return new Promise((resolve, reject) => {
      createMeshObject(result.vertices, result.indices, result.uv, result.faceGroup, result.textures).then((createRes) => {
      // debugger
        const [geometry, material] = [createRes.geometry, createRes.materialArr]
        const object3D = new Mesh()
        object3D.geometry = geometry
        object3D.material = material
        object3D.traverse((o) => {
          if (o.isMesh) {
            if (o.material && o.material.length) {
              o.material.map(item => {
                item.side = DoubleSide
              })
            }
            if (self.meshCallback) {
              self.meshCallback(o)
            }
          }
        })
        const model = { scene: object3D }
        resolve({ 'model': model, 'url': url })
      })
    })
  }

  return {
    'load': load,
    'rootJson': function () {
      return rootJson.root
    }
  }
}

export { Loader }
