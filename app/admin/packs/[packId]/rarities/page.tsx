'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Info, Package, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase/client'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

interface PageProps {
  params: { packId: string }
}

interface PackRarity {
  id: number
  pack_id: string
  rarity_id: number
  cards_per_box: number
  notes?: string
  box_input_x?: string
  box_input_y?: string
  rarity?: { 
    name: string
    color: string
    display_order: number
  }
  total_types?: number
  rate_per_card?: number
}

interface Pack {
  id: string
  name: string
  box_price?: number
}

interface AvailablePack {
  id: string
  name: string
}

export default function PackRaritiesPage({ params }: PageProps) {
  const [pack, setPack] = useState<Pack | null>(null)
  const [packRarities, setPackRarities] = useState<PackRarity[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editedValues, setEditedValues] = useState<Record<number, { cards_per_box: string; notes: string }>>({})
  const [boxInputs, setBoxInputs] = useState<Record<number, { boxes: string; cards: string }>>({})
  const [availablePacks, setAvailablePacks] = useState<AvailablePack[]>([])
  const [showCopyModal, setShowCopyModal] = useState(false)

  const loadPackAndRarities = useCallback(async () => {
    try {
      setLoading(true)
      
      // パック情報を取得
      const { data: packData, error: packError } = await supabase
        .from('packs')
        .select('id, name, box_price')
        .eq('id', params.packId)
        .single()
      
      if (packError) throw packError
      setPack(packData)
      
      // pack_rarity_detailsビューから取得
      const { data, error } = await supabase
        .from('pack_rarity_details')
        .select('*')
        .eq('pack_id', params.packId)
        .order('display_order')

      if (error) throw error
      
      // データを整形
      const formattedData = data?.map(item => ({
        id: item.id,
        pack_id: item.pack_id,
        rarity_id: item.rarity_id,
        cards_per_box: item.cards_per_box || 0,
        notes: item.notes,
        box_input_x: item.box_input_x,
        box_input_y: item.box_input_y,
        rarity: { 
          name: item.rarity_name, 
          color: item.rarity_color,
          display_order: item.display_order
        },
        total_types: item.total_types || 0,
        rate_per_card: item.rate_per_card || 0
      })) || []
      
      setPackRarities(formattedData)
      
      // 既存のcards_per_boxからboxInputsを初期化
      const initialBoxInputs: Record<number, { boxes: string; cards: string }> = {}
      
      formattedData.forEach(pr => {
        // box_input_x, box_input_yが保存されていればそれを使用
        if (pr.box_input_x && pr.box_input_y) {
          // 整数に変換して保存
          initialBoxInputs[pr.id] = {
            boxes: Math.floor(parseFloat(pr.box_input_x) || 1).toString(),
            cards: Math.floor(parseFloat(pr.box_input_y) || 0).toString()
          }
        } else {
          // 保存されていない場合は初期値を設定
          const cardsPerBox = pr.cards_per_box || 0
          if (cardsPerBox > 0) {
            initialBoxInputs[pr.id] = {
              boxes: '1',
              cards: Math.floor(cardsPerBox).toString()
            }
          }
        }
      })
      
      setBoxInputs(initialBoxInputs)
    } catch (error) {
      console.error('Error loading pack rarities:', error)
      alert('封入率データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [params.packId])

  useEffect(() => {
    loadPackAndRarities()
    // 他の弾一覧を取得
    loadAvailablePacks()
  }, [loadPackAndRarities])

  const loadAvailablePacks = async () => {
    try {
      const { data, error } = await supabase
        .from('packs')
        .select('id, name')
        .neq('id', params.packId)
        .order('name')

      if (error) throw error
      setAvailablePacks(data || [])
    } catch (error) {
      console.error('Error loading available packs:', error)
    }
  }

  const handleInputChange = (id: number, field: 'cards_per_box' | 'notes', value: string) => {
    setEditedValues(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }))
  }

  const handleBoxInputChange = (id: number, field: 'boxes' | 'cards', value: string) => {
    // 整数のみ許可（小数点を含む値は整数に変換）
    const intValue = value === '' ? '' : Math.floor(parseFloat(value) || 0).toString()
    
    const newBoxInputs = {
      ...boxInputs,
      [id]: {
        ...boxInputs[id],
        [field]: intValue
      }
    }
    setBoxInputs(newBoxInputs)
    
    // xBOXにy枚から1BOXあたりの枚数を計算
    const input = newBoxInputs[id]
    if (input && input.boxes && input.cards) {
      const boxes = parseInt(input.boxes)
      const cards = parseInt(input.cards)
      if (boxes > 0 && !isNaN(cards)) {
        const cardsPerBox = cards / boxes
        handleInputChange(id, 'cards_per_box', cardsPerBox.toString())
      }
    }
  }

  const handleSave = async (packRarity: PackRarity) => {
    const edited = editedValues[packRarity.id]
    if (!edited) return

    try {
      setSaving(true)
      const updates: any = {}
      
      if (edited.cards_per_box !== undefined) {
        updates.cards_per_box = parseFloat(edited.cards_per_box)
      }
      
      if (edited.notes !== undefined) {
        updates.notes = edited.notes
      }

      // boxInputsの値も一緒に保存
      const boxInput = boxInputs[packRarity.id]
      if (boxInput) {
        updates.box_input_x = boxInput.boxes
        updates.box_input_y = boxInput.cards
      }

      const { data, error } = await supabase
        .from('pack_rarities')
        .update(updates)
        .eq('id', packRarity.id)
        .select()

      if (error) throw error

      alert('封入率を更新しました')
      await loadPackAndRarities()
      
      // 編集値をクリア
      setEditedValues(prev => {
        const newValues = { ...prev }
        delete newValues[packRarity.id]
        return newValues
      })
    } catch (error) {
      console.error('Error updating pack rarity:', error)
      alert('封入率の更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAll = async () => {
    const hasAnyChanges = Object.keys(editedValues).some(id => {
      const packRarity = packRarities.find(pr => pr.id === parseInt(id))
      return packRarity && hasChanges(packRarity)
    })

    if (!hasAnyChanges) {
      alert('変更がありません')
      return
    }

    try {
      setSaving(true)
      let successCount = 0
      let errorCount = 0

      // 変更があるものすべてを更新
      for (const [id, edited] of Object.entries(editedValues)) {
        const packRarity = packRarities.find(pr => pr.id === parseInt(id))
        if (!packRarity || !hasChanges(packRarity)) continue

        const updates: any = {}
        
        if (edited.cards_per_box !== undefined) {
          updates.cards_per_box = parseFloat(edited.cards_per_box)
        }
        
        if (edited.notes !== undefined) {
          updates.notes = edited.notes
        }

        // boxInputsの値も一緒に保存
        const boxInput = boxInputs[parseInt(id)]
        if (boxInput) {
          updates.box_input_x = boxInput.boxes
          updates.box_input_y = boxInput.cards
        }

        const { error } = await supabase
          .from('pack_rarities')
          .update(updates)
          .eq('id', parseInt(id))

        if (error) {
          console.error(`Error updating ${packRarity.rarity?.name}:`, error)
          errorCount++
        } else {
          successCount++
        }
      }

      if (errorCount > 0) {
        alert(`${successCount}件更新成功、${errorCount}件エラーが発生しました`)
      } else {
        alert(`${successCount}件の封入率を更新しました`)
      }

      await loadPackAndRarities()
      setEditedValues({})
    } catch (error) {
      console.error('Error updating pack rarities:', error)
      alert('封入率の更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const getValue = (packRarity: PackRarity, field: 'cards_per_box' | 'notes') => {
    const edited = editedValues[packRarity.id]
    if (edited && edited[field] !== undefined) {
      return edited[field]
    }
    return field === 'cards_per_box' ? packRarity.cards_per_box.toString() : (packRarity.notes || '')
  }

  const hasChanges = (packRarity: PackRarity) => {
    const edited = editedValues[packRarity.id]
    if (!edited) return false
    
    return (
      (edited.cards_per_box !== undefined && parseFloat(edited.cards_per_box) !== packRarity.cards_per_box) ||
      (edited.notes !== undefined && edited.notes !== (packRarity.notes || ''))
    )
  }

  // 初期データがない場合は作成
  const initializePackRarities = async () => {
    try {
      setSaving(true)
      
      // すべてのレアリティを取得
      const { data: rarities } = await supabase
        .from('rarities')
        .select('id, name')
        .order('display_order')
      
      if (!rarities) return
      
      // デフォルトの封入率
      const defaultRates: Record<string, number> = {
        'C': 50.0, 'U': 30.0, 'UC': 30.0, 'R': 8.0,
        'VR': 4.0, 'SR': 2.0, 'MR': 0.5, 'OR': 0.25,
        'DM': 0.125, 'DM㊙': 0.0625, '㊙': 0.5,
        'T': 3.0, 'TD': 0.5, 'SP': 0.5, 'TR': 1.0
      }
      
      // 各レアリティのデータを作成
      for (const rarity of rarities) {
        await supabase
          .from('pack_rarities')
          .upsert({
            pack_id: params.packId,
            rarity_id: rarity.id,
            cards_per_box: defaultRates[rarity.name] || 1.0,
            notes: ''
          }, {
            onConflict: 'pack_id,rarity_id'
          })
      }
      
      await loadPackAndRarities()
      alert('封入率の初期データを作成しました')
    } catch (error) {
      console.error('Error initializing pack rarities:', error)
      alert('初期データの作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 他の弾の設定をコピー
  const copyFromOtherPack = async (sourcePackId: string) => {
    try {
      setSaving(true)

      // コピー元の封入率データを取得
      const { data: sourceRarities, error: fetchError } = await supabase
        .from('pack_rarities')
        .select('rarity_id, cards_per_box, notes, box_input_x, box_input_y')
        .eq('pack_id', sourcePackId)

      if (fetchError) throw fetchError
      if (!sourceRarities || sourceRarities.length === 0) {
        alert('コピー元の弾に封入率データがありません')
        return
      }

      // コピー先に既存のデータがない場合は初期化
      if (packRarities.length === 0) {
        await initializePackRarities()
      }

      // 各レアリティの設定をコピー
      for (const sourceRarity of sourceRarities) {
        const { error: updateError } = await supabase
          .from('pack_rarities')
          .update({
            cards_per_box: sourceRarity.cards_per_box,
            notes: sourceRarity.notes,
            box_input_x: sourceRarity.box_input_x,
            box_input_y: sourceRarity.box_input_y
          })
          .eq('pack_id', params.packId)
          .eq('rarity_id', sourceRarity.rarity_id)

        if (updateError) {
          console.error('Error updating rarity:', updateError)
        }
      }

      await loadPackAndRarities()
      alert('封入率設定をコピーしました')
    } catch (error) {
      console.error('Error copying pack rarities:', error)
      alert('封入率設定のコピーに失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    )
  }

  if (!pack) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 dark:text-gray-400">パック情報が見つかりません</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/packs">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              弾管理へ戻る
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mt-4">
            {pack.name} - 封入率設定
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
            各レアリティの1BOXあたりの排出枚数を設定
          </p>
        </div>
      </div>

      {/* 説明 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-1">封入率の設定方法</p>
            <ul className="list-disc list-inside space-y-1">
              <li>「BOX排出枚数」: 1BOXあたりに入っている枚数を設定</li>
              <li>「全種類数」: 登録されたカードから自動でカウント</li>
              <li>「1種あたり」: BOX排出枚数÷全種類数で自動計算</li>
              <li>C/UC以外は同じカードが重複しない前提で期待値を計算</li>
            </ul>
          </div>
        </div>
      </div>

      {/* アクションボタン */}
      <div className="flex justify-between items-center">
        {/* 他の弾からコピーボタン */}
        {availablePacks.length > 0 && (
          <div className="relative">
            <Button
              onClick={() => setShowCopyModal(!showCopyModal)}
              variant="outline"
              disabled={saving}
            >
              <Copy className="mr-2 h-4 w-4" />
              他の弾からコピー
            </Button>
            
            {/* コピー元選択モーダル */}
            {showCopyModal && (
              <div className="absolute top-full mt-2 left-0 z-10 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-medium mb-3">コピー元の弾を選択</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {availablePacks.map((availablePack) => (
                    <Button
                      key={availablePack.id}
                      onClick={() => {
                        copyFromOtherPack(availablePack.id)
                        setShowCopyModal(false)
                      }}
                      variant="ghost"
                      className="w-full justify-start text-sm"
                      disabled={saving}
                    >
                      {availablePack.name}
                    </Button>
                  ))}
                </div>
                <Button
                  onClick={() => setShowCopyModal(false)}
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full"
                >
                  キャンセル
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 一括保存ボタン */}
        {packRarities.length > 0 && Object.keys(editedValues).length > 0 && (
          <Button
            onClick={handleSaveAll}
            disabled={saving || !Object.keys(editedValues).some(id => {
              const pr = packRarities.find(p => p.id === parseInt(id))
              return pr && hasChanges(pr)
            })}
            className="bg-blue-600 hover:bg-blue-700 ml-auto"
          >
            <Save className="mr-2 h-4 w-4" />
            変更をすべて保存
          </Button>
        )}
      </div>

      {/* 使い方の説明 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4 mb-4">
        <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
          封入率の入力方法
        </h3>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>• 「xBOXにy枚」形式で入力すると、自動的に1BOXあたりの枚数を計算します</li>
          <li>• 例：2BOXに1枚 → 0.5枚/BOX、16BOXに1枚 → 0.0625枚/BOX</li>
          <li>• 1BOXあたりの枚数を直接編集することも可能です</li>
        </ul>
      </div>

      {packRarities.length === 0 ? (
        <div className="text-center py-8">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            封入率データがまだ設定されていません
          </p>
          <Button onClick={initializePackRarities} disabled={saving}>
            初期データを作成
          </Button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  レアリティ
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <span className="hidden sm:inline">全種類数</span>
                  <span className="sm:hidden">種類</span>
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <span className="hidden sm:inline">封入率（xBOXにy枚）</span>
                  <span className="sm:hidden">封入率</span>
                </th>
                <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  1種あたり
                </th>
                <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  特記事項
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  状態
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {packRarities.map((pr) => (
                <tr key={pr.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                    <span 
                      className="inline-flex px-2 py-1 text-xs font-semibold rounded-full text-white"
                      style={{ backgroundColor: pr.rarity?.color || '#6B7280' }}
                    >
                      {pr.rarity?.name}
                    </span>
                  </td>
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    <span className="hidden sm:inline">{pr.total_types}種類</span>
                    <span className="sm:hidden">{pr.total_types}</span>
                  </td>
                  <td className="px-3 sm:px-6 py-4">
                    <div className="flex flex-col space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="flex items-center space-x-1">
                          <Input
                            type="number"
                            value={boxInputs[pr.id]?.boxes || ''}
                            onChange={(e) => handleBoxInputChange(pr.id, 'boxes', e.target.value)}
                            placeholder="x"
                            className="w-16 sm:w-20 text-center text-sm sm:text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            step="1"
                            min="1"
                            style={{ textAlign: 'center' }}
                          />
                          <span className="text-xs text-gray-500 whitespace-nowrap">BOXに</span>
                          <Input
                            type="number"
                            value={boxInputs[pr.id]?.cards || ''}
                            onChange={(e) => handleBoxInputChange(pr.id, 'cards', e.target.value)}
                            placeholder="y"
                            className="w-16 sm:w-20 text-center text-sm sm:text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            step="1"
                            min="0"
                            style={{ textAlign: 'center' }}
                          />
                          <span className="text-xs text-gray-500">枚</span>
                        </div>
                        {/* スマホ用：現在の値を表示 */}
                        <div className="sm:hidden text-xs text-gray-600 dark:text-gray-400">
                          = {getValue(pr, 'cards_per_box')}枚/BOX
                        </div>
                      </div>
                    </div>
                    <input
                      type="hidden"
                      value={getValue(pr, 'cards_per_box')}
                    />
                  </td>
                  <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {pr.rate_per_card?.toFixed(4) || '0.0000'}枚
                  </td>
                  <td className="hidden md:table-cell px-6 py-4">
                    <Input
                      value={getValue(pr, 'notes')}
                      onChange={(e) => handleInputChange(pr.id, 'notes', e.target.value)}
                      placeholder="例：SR以上確定パック"
                      className="w-full"
                    />
                  </td>
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                    {hasChanges(pr) && (
                      <span className="text-xs text-orange-600 dark:text-orange-400">
                        ※未保存
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* BOX価格情報 */}
      {pack.box_price && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            BOX価格: <span className="font-bold text-gray-900 dark:text-white">¥{pack.box_price.toLocaleString()}</span>
          </p>
        </div>
      )}
    </div>
  )
}